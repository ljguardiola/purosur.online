// Shared by every process's Sentry init (main, core, renderer) so the same discipline applies
// everywhere: never a CUIT or DNI, never an HTTP request body (which is how an outbox event's
// payload would otherwise travel), never a token/key/secret/password, never a presigned URL's
// signed query string. What reaches Sentry is the error type, its stack trace, and opaque ids.

const REDACTED = "[redacted]";

// A CUIT is 11 digits, either run together or split 2-8-1 with hyphens; a DNI is 7 or 8 digits,
// either run together or with dots as thousands separators. Matched in that order so a CUIT's
// digits are never left exposed as if they were a shorter DNI. A run of digits joined to a letter,
// a hyphen or a decimal point is part of something else, such as a UUID or a fractional number; an
// underscore only separates a label from the number it names.
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

// The http.query and http.fragment breadcrumb fields hold the part of a URL Sentry strips from it.
const SENSITIVE_KEY_PATTERN = /token|key|secret|password|authorization|query|fragment/i;
// Matched as whole words of the field name, so a name like "circuit" or "midnight" is left alone.
const IDENTIFIER_KEY_WORDS = new Set(["cuit", "dni", "documento"]);

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return true;
  }
  return key
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .some((word) => IDENTIFIER_KEY_WORDS.has(word.toLowerCase()));
}

const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;

function redactUrlQueries(value: string): string {
  return value.replace(URL_PATTERN, (url) => {
    const queryStart = url.search(/[?#]/);
    return queryStart === -1 ? url : `${url.slice(0, queryStart)}?${REDACTED}`;
  });
}

function redactString(value: string): string {
  return redactUrlQueries(value).replace(CUIT_PATTERN, REDACTED).replace(DNI_PATTERN, REDACTED);
}

function isIdentifierNumber(value: number): boolean {
  return Number.isInteger(value) && IDENTIFIER_NUMBER_PATTERN.test(String(Math.abs(value)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Sentry's own context integrations put these numeric diagnostics (memory sizes, CPU figures) at
// the top of their context sections, where they easily have 8 or 11 digits. Only these exact
// fields, in these sections, keep their numbers; any other number is treated like one from the
// business.
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
// The same diagnostics reach every log as "<section>.<field>" attributes.
const SDK_LOG_ATTRIBUTE_DIAGNOSTICS: ReadonlySet<string> = new Set(
  [...SDK_CONTEXT_SECTIONS].flatMap((section) =>
    [...SDK_NUMERIC_DIAGNOSTICS].map((field) => `${section}.${field}`),
  ),
);

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" && isIdentifierNumber(value)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (isPlainObject(value)) {
    return redactRecord(value);
  }
  return value;
}

function redactRecord(
  record: Record<string, unknown>,
  numericDiagnostics: ReadonlySet<string> = NO_DIAGNOSTICS,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else if (typeof value === "number" && numericDiagnostics.has(key)) {
      result[key] = value;
    } else {
      result[key] = redactValue(value);
    }
  }
  return result;
}

function redactContexts(contexts: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(contexts)) {
    result[section] =
      isPlainObject(value) && SDK_CONTEXT_SECTIONS.has(section)
        ? redactRecord(value, SDK_NUMERIC_DIAGNOSTICS)
        : redactValue(value);
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

/** `beforeSend`: scrubs an error/message event before it leaves the process. */
export function scrubSentryEvent<E extends EventLike>(event: E): E {
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
    contexts: rest.contexts ? redactContexts(rest.contexts) : rest.contexts,
    tags: rest.tags ? redactRecord(rest.tags) : rest.tags,
    breadcrumbs: rest.breadcrumbs?.map((breadcrumb) => scrubSentryBreadcrumb(breadcrumb)),
  } as E;
}

/** `beforeBreadcrumb`: scrubs one breadcrumb before it is attached to future events. */
export function scrubSentryBreadcrumb<B extends BreadcrumbLike>(breadcrumb: B): B {
  const rest = breadcrumb as BreadcrumbLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    data: rest.data ? redactRecord(rest.data) : rest.data,
  } as B;
}

/** `beforeSendLog`: scrubs one console-forwarded log entry before it leaves the process. */
export function scrubSentryLog<L extends LogLike>(log: L): L {
  const rest = log as LogLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    attributes: rest.attributes
      ? redactRecord(rest.attributes, SDK_LOG_ATTRIBUTE_DIAGNOSTICS)
      : rest.attributes,
  } as L;
}
