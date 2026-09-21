// Shared by every process's Sentry init (main, core, renderer) so the same discipline applies
// everywhere: never a CUIT or DNI, never an HTTP request body (which is how an outbox event's
// payload would otherwise travel), never a token/key/secret/password, never a presigned URL's
// signed query string. What reaches Sentry is the error type, its stack trace, and opaque ids.

const REDACTED = "[redacted]";

// A CUIT is 11 digits, either run together or split 2-8-1 with hyphens; a DNI is 7 or 8 digits,
// either run together or with dots as thousands separators. Matched in that order so a CUIT's
// digits are never left exposed as if they were a shorter DNI. A run of digits joined to a letter,
// a hyphen or a decimal point is part of something else, such as a UUID or a fractional number.
const NOT_JOINED_BEFORE = String.raw`(?<![\w-])(?<!\d\.)`;
const NOT_JOINED_AFTER = String.raw`(?![\w-])(?!\.\d)`;
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
const SENSITIVE_KEY_PATTERN =
  /token|key|secret|password|authorization|query|fragment|cuit|dni|documento/i;

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

interface RedactionOptions {
  readonly numbers: boolean;
}

const ALL_VALUES: RedactionOptions = { numbers: true };
// Sentry's own context integrations fill these sections with numeric diagnostics such as memory
// sizes, which easily have 8 or 11 digits; only their strings can carry anything from the business.
const STRINGS_ONLY: RedactionOptions = { numbers: false };
const SDK_CONTEXT_SECTIONS = new Set([
  "app",
  "browser",
  "chrome",
  "cloud_resource",
  "culture",
  "device",
  "gpu",
  "node",
  "os",
  "runtime",
  "trace",
]);

function redactValue(value: unknown, options: RedactionOptions): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" && options.numbers && isIdentifierNumber(value)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, options));
  }
  if (isPlainObject(value)) {
    return redactRecord(value, options);
  }
  return value;
}

function redactRecord(
  record: Record<string, unknown>,
  options: RedactionOptions = ALL_VALUES,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(value, options);
  }
  return result;
}

function redactContexts(contexts: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(contexts)) {
    result[section] = redactValue(
      value,
      SDK_CONTEXT_SECTIONS.has(section) ? STRINGS_ONLY : ALL_VALUES,
    );
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
    attributes: rest.attributes ? redactRecord(rest.attributes) : rest.attributes,
  } as L;
}
