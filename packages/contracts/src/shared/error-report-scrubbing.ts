const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERN =
  /token|key|secret|password|authorization|cookie|credential|query|fragment/i;
// Matched only at the start of a word, since these are short enough to appear inside an unrelated
// word (`circuit`, `admin`).
const SENSITIVE_KEY_WORD_PATTERN = /(?:^|_)(?:session|cuit|dni)/;
// Dropped entirely rather than redacted field-by-field: a request/response body can carry an
// arbitrary business payload, which no key-based scrub can enumerate safely.
const DROPPED_SECTIONS = new Set(["request", "response"]);

const URL_PATTERN = /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-_.]+/g;

// Only a closing bracket/parenthesis/angle-bracket/quote/backtick is trusted as wrapping a path
// rather than part of it; sentence punctuation stays inside the redaction instead of being guessed at.
const TRAILING_DELIMITER_PATTERN = /[\])>"'`]$/;

function redactPathToken(token: string): string {
  const slashIndex = token.indexOf("/");
  if (slashIndex === -1) {
    return token;
  }
  const queryIndex = token.search(/[?#]/);
  if (queryIndex === -1 || queryIndex < slashIndex) {
    return token;
  }

  const queryPart = token.slice(queryIndex + 1);
  if (queryPart === REDACTED) {
    // Already scrubbed by URL_PATTERN above, or by this same pass on an earlier call: redacting
    // again would misread the placeholder's own closing "]" as a delimiter to preserve.
    return token;
  }

  const closingDelimiter = TRAILING_DELIMITER_PATTERN.exec(queryPart)?.[0] ?? "";
  return `${token.slice(0, queryIndex)}?${REDACTED}${closingDelimiter}`;
}

function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || SENSITIVE_KEY_WORD_PATTERN.test(toSnakeCase(key));
}

// A URL whose authority carries userinfo (`scheme://user:pass@host`) embeds a credential, as a
// Postgres connection string does; the whole URL is redacted rather than only its query string.
function redactUrl(url: string): string {
  const schemeEnd = url.indexOf("://") + 3;
  const authorityEnd = url.indexOf("/", schemeEnd);
  const authority = authorityEnd === -1 ? url.slice(schemeEnd) : url.slice(schemeEnd, authorityEnd);
  if (authority.includes("@")) {
    return REDACTED;
  }
  const queryStart = url.search(/[?#]/);
  return queryStart === -1 ? url : `${url.slice(0, queryStart)}?${REDACTED}`;
}

function redactString(value: string): string {
  return value
    .replace(URL_PATTERN, redactUrl)
    .replace(/\S+/g, redactPathToken)
    .replace(BEARER_TOKEN_PATTERN, REDACTED);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (isPlainObject(value)) {
    return redactRecord(value);
  }
  return value;
}

function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(value);
  }
  return result;
}

function redactSections(sections: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(sections)) {
    if (DROPPED_SECTIONS.has(name)) {
      continue;
    }
    result[name] = redactValue(value);
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
    breadcrumbs: rest.breadcrumbs?.map(scrubBreadcrumb),
  } as E;
}

function scrubBreadcrumb<B extends BreadcrumbLike>(breadcrumb: B): B {
  const rest = breadcrumb as BreadcrumbLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    data: rest.data ? redactRecord(rest.data) : rest.data,
  } as B;
}
