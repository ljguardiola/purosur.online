// Shared by every process's Sentry init (main, core, renderer) so the same discipline applies
// everywhere: never a CUIT or DNI, never an HTTP request body (which is how an outbox event's
// payload would otherwise travel), never a token/key/secret/password, never a presigned URL's
// signed query string. What reaches Sentry is the error type, its stack trace, and opaque ids.

const REDACTED = "[redacted]";

// A CUIT is 11 digits, either run together or split 2-8-1 with hyphens; a DNI is 7 or 8 digits.
// Matched in that order so a CUIT's digits are never left exposed as if they were a shorter DNI.
const CUIT_PATTERN = /\b\d{2}-\d{8}-\d\b|\b\d{11}\b/g;
const DNI_PATTERN = /\b\d{7,8}\b/g;

const SENSITIVE_KEY_PATTERN = /token|key|secret|password|authorization/i;

function redactUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    return url.search ? `${url.origin}${url.pathname}?${REDACTED}` : value;
  } catch {
    return value;
  }
}

function redactString(value: string): string {
  return redactUrlQuery(value).replace(CUIT_PATTERN, REDACTED).replace(DNI_PATTERN, REDACTED);
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
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(value);
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
    contexts: rest.contexts ? redactRecord(rest.contexts) : rest.contexts,
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
