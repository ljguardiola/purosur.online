const REDACTED = "[redacted]";
const CIRCULAR = "[circular]";

const SENSITIVE_KEY_PATTERN =
  /token|key|secret|password|authorization|cookie|credential|query|fragment/i;
// Matched only at the start of a word, since these are short enough to appear inside an unrelated
// word (`circuit`, `midnight`).
const SENSITIVE_KEY_WORD_PATTERN = /(?:^|_)(?:session|cuit|dni|documento)/;
// Dropped entirely rather than redacted field-by-field: a request/response body can carry an
// arbitrary business payload, which no key-based scrub can enumerate safely.
const DROPPED_SECTIONS = new Set(["request", "response"]);

// Matched CUIT before DNI so a CUIT's digits are never left exposed as a shorter DNI. The
// boundaries exclude a letter, hyphen or decimal point so a UUID or fractional number is left alone.
const NOT_JOINED_BEFORE = String.raw`(?<![A-Za-z0-9-])(?<!\d\.)`;
const NOT_JOINED_AFTER = String.raw`(?![A-Za-z0-9-])(?!\.\d)`;
const CUIT_PATTERN = new RegExp(
  `${NOT_JOINED_BEFORE}(?:\\d{2}-\\d{8}-\\d|\\d{11})${NOT_JOINED_AFTER}`,
  "g",
);
const DNI_PATTERN = new RegExp(
  `${NOT_JOINED_BEFORE}(?:\\d{1,2}\\.\\d{3}\\.\\d{3}|\\d{7,8})${NOT_JOINED_AFTER}`,
  "g",
);
const IDENTIFIER_NUMBER_PATTERN = /^(?:\d{11}|\d{7,8})$/;

// Sentry's own context integrations put these numeric diagnostics (memory sizes, CPU figures) in
// these sections, easily 8-11 digits; only they keep their numbers, to avoid a false CUIT/DNI match.
const SDK_CONTEXT_SECTIONS = new Set(["app", "device"]);
const SDK_NUMERIC_DIAGNOSTICS = new Set([
  "app_memory",
  "free_memory",
  "memory_size",
  "processor_count",
  "processor_frequency",
  "screen_density",
]);
const NO_DIAGNOSTICS: ReadonlySet<string> = new Set();
const NO_ERRORS: ReadonlySet<Error> = new Set();
// The same diagnostics reach every log as "<section>.<field>" attributes.
const SDK_LOG_ATTRIBUTE_DIAGNOSTICS: ReadonlySet<string> = new Set(
  [...SDK_CONTEXT_SECTIONS].flatMap((section) =>
    [...SDK_NUMERIC_DIAGNOSTICS].map((field) => `${section}.${field}`),
  ),
);

// Starts only where a run of scheme characters starts: a start inside the run would rescan it to
// its end each time, which is quadratic on a long dotted word.
const URL_PATTERN = /(?<![a-zA-Z0-9+.-])[a-zA-Z0-9+.-]+:\/\/[^\s"'<>]+/g;
const USERINFO_PATTERN = /^[^/]*@/;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-_.]+/g;
// The domain must end in letters, so a package or release name such as `purosur-pos@1.2.3` is kept.
const EMAIL_PATTERN = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
// A home folder is matched where a path starts, also under `/var`, `/export`, a drive letter
// (`/c`, `/mnt/c`, `/cygdrive/c`) or Vite's `/@fs`, so a URL's own `/home/` segment is kept. An
// account ending the whole text is not recognized, so a backoffice route such as `/home/alerts`
// is kept; a period only ends an account when it ends a sentence, since account names contain dots.
const UNIX_HOME_ACCOUNT_PATTERN =
  /((?:(?<![\w.-])(?:\/var|\/export|\/cygdrive\/[a-z]|\/mnt\/[a-z]|\/[a-z])?|\/@fs)\/(?:home|Users)\/)(?:[^/\s:,;"'`()<>[\].]|\.(?![\s"'`)]))+(?=[/\s"'`()<>[\],;:]|\.(?:[\s"'`)]|$))/g;
// A Windows account name can contain spaces, quotes and parentheses, so everything after it is
// hidden up to the next folder separator or line end.
const WINDOWS_HOME_ACCOUNT_PATTERN = /(?<![A-Za-z0-9])([A-Z]:(?:\\+|\/)Users(?:\\+|\/))[^\\/\n]+/gi;
// A stack frame writes the line and column right after the script's URL, inside the same word.
const FRAME_POSITION_PATTERN = /:\d+:\d+\)?$/;
const SCRIPT_FILE_PATTERN = /\.[cm]?[jt]sx?$/;

// Only a closing bracket/parenthesis/angle-bracket/quote/backtick is trusted as wrapping a path
// rather than part of it; sentence punctuation stays inside the redaction instead of being guessed at.
const TRAILING_DELIMITER_PATTERN = /[\])>"'`]$/;

function framePosition(path: string, text: string): string {
  return SCRIPT_FILE_PATTERN.test(path) ? (FRAME_POSITION_PATTERN.exec(text)?.[0] ?? "") : "";
}

function redactPathToken(token: string): string {
  const queryIndex = token.search(/[?#]/);
  if (queryIndex === -1 || token.lastIndexOf("/", queryIndex) === -1) {
    return token;
  }

  const queryPart = token.slice(queryIndex + 1);
  if (queryPart === REDACTED) {
    // Already scrubbed by URL_PATTERN above, or by this same pass on an earlier call: redacting
    // again would misread the placeholder's own closing "]" as a delimiter to preserve.
    return token;
  }

  const kept =
    framePosition(token.slice(0, queryIndex), token) ||
    (TRAILING_DELIMITER_PATTERN.exec(queryPart)?.[0] ?? "");
  return `${token.slice(0, queryIndex)}?${REDACTED}${kept}`;
}

function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || SENSITIVE_KEY_WORD_PATTERN.test(toSnakeCase(key));
}

// A URL whose authority carries userinfo (`scheme://user:pass@host`) embeds a credential, as a
// Postgres connection string does; the whole URL is redacted rather than only its query string.
function redactUrl(url: string): string {
  if (USERINFO_PATTERN.test(url.slice(url.indexOf("://") + 3))) {
    return REDACTED;
  }
  const queryStart = url.search(/[?#]/);
  if (queryStart === -1) {
    return url;
  }
  const path = url.slice(0, queryStart);
  return `${path}?${REDACTED}${framePosition(path, url)}`;
}

function redactString(value: string): string {
  return value
    .replace(URL_PATTERN, redactUrl)
    .replace(/\S+/g, redactPathToken)
    .replace(BEARER_TOKEN_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(WINDOWS_HOME_ACCOUNT_PATTERN, `$1${REDACTED}`)
    .replace(UNIX_HOME_ACCOUNT_PATTERN, `$1${REDACTED}`)
    .replace(CUIT_PATTERN, REDACTED)
    .replace(DNI_PATTERN, REDACTED);
}

function isIdentifierNumber(value: number): boolean {
  return Number.isInteger(value) && IDENTIFIER_NUMBER_PATTERN.test(String(Math.abs(value)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readableError(error: Error): Record<string, unknown> {
  return {
    ...error,
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause instanceof Error && { cause: error.cause }),
  };
}

function readableDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? String(date) : date.toISOString();
}

function redactValue(value: unknown, enclosingErrors: ReadonlySet<Error>): unknown {
  if (value instanceof Error) {
    return enclosingErrors.has(value)
      ? CIRCULAR
      : redactRecord(readableError(value), NO_DIAGNOSTICS, new Set(enclosingErrors).add(value));
  }
  if (value instanceof Date) {
    return readableDate(value);
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" && isIdentifierNumber(value)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, enclosingErrors));
  }
  if (isPlainObject(value)) {
    return redactRecord(value, NO_DIAGNOSTICS, enclosingErrors);
  }
  return value;
}

function redactRecord(
  record: Record<string, unknown>,
  numericDiagnostics: ReadonlySet<string> = NO_DIAGNOSTICS,
  enclosingErrors: ReadonlySet<Error> = NO_ERRORS,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else if (typeof value === "number" && numericDiagnostics.has(key)) {
      result[key] = value;
    } else {
      result[key] = redactValue(value, enclosingErrors);
    }
  }
  return result;
}

function redactSections(sections: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(sections)) {
    if (DROPPED_SECTIONS.has(name)) {
      continue;
    }
    result[name] =
      isPlainObject(value) && SDK_CONTEXT_SECTIONS.has(name)
        ? redactRecord(value, SDK_NUMERIC_DIAGNOSTICS)
        : redactValue(value, NO_ERRORS);
  }
  return result;
}

interface ExceptionValueLike {
  value?: string;
}

interface BreadcrumbLike {
  message?: string;
  data?: Record<string, unknown>;
}

interface EventLike {
  message?: string;
  exception?: { values?: ExceptionValueLike[] };
  breadcrumbs?: BreadcrumbLike[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  request?: unknown;
}

interface LogLike {
  message?: string;
  attributes?: Record<string, unknown>;
}

export function scrubErrorReport<E extends EventLike>(event: E): E {
  const { request: _request, ...rest } = event as EventLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    exception: rest.exception?.values
      ? {
          ...rest.exception,
          values: rest.exception.values.map((exceptionValue) =>
            exceptionValue.value === undefined
              ? exceptionValue
              : { ...exceptionValue, value: redactString(exceptionValue.value) },
          ),
        }
      : rest.exception,
    extra: rest.extra ? redactRecord(rest.extra) : rest.extra,
    contexts: rest.contexts ? redactSections(rest.contexts) : rest.contexts,
    tags: rest.tags ? redactRecord(rest.tags) : rest.tags,
    breadcrumbs: rest.breadcrumbs?.map(scrubErrorReportBreadcrumb),
  } as E;
}

export function scrubErrorReportBreadcrumb<B extends BreadcrumbLike>(breadcrumb: B): B {
  const rest = breadcrumb as BreadcrumbLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    data: rest.data ? redactRecord(rest.data) : rest.data,
  } as B;
}

export function scrubErrorReportLog<L extends LogLike>(log: L): L {
  const rest = log as LogLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    attributes: rest.attributes
      ? redactRecord(rest.attributes, SDK_LOG_ATTRIBUTE_DIAGNOSTICS)
      : rest.attributes,
  } as L;
}
