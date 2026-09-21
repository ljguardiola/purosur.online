// `beforeSend` for the cloud service's Sentry init. Per the design (puro-sur-pos.md §9.6,
// "Qué no sale de la nube hacia Sentry"): never the body of an HTTP request or response, never
// auth headers or cookies, never a query string (which is how a presigned URL's signature or a
// token-in-query would otherwise travel), never a token, key, secret, password, backoffice session
// identifier, CUIT, DNI or a credential embedded in a connection string. What reaches Sentry is
// the error type, its stack trace, and opaque identifiers.

const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERN =
  /token|key|secret|password|authorization|cookie|credential|query|fragment/i;
// Matched only at the start of a word of the key, since these are short enough to appear inside
// unrelated words (`circuit`, `admin`).
const SENSITIVE_KEY_WORD_PATTERN = /(?:^|_)(?:session|cuit|dni)/;
// Sections dropped entirely rather than redacted field-by-field: a request or response object can
// carry an arbitrary business payload in its body, which no key-based scrub can enumerate safely.
const DROPPED_SECTIONS = new Set(["request", "response"]);

const URL_PATTERN = /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+/g;
const RELATIVE_PATH_WITH_QUERY_PATTERN = /(^|[\s"'(=,;])(\/[^\s"'<>?#]*)[?#][^\s"'<>]*/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-_.]+/g;

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
    .replace(RELATIVE_PATH_WITH_QUERY_PATTERN, `$1$2?${REDACTED}`)
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
    contexts: rest.contexts ? redactSections(rest.contexts) : rest.contexts,
    tags: rest.tags ? redactRecord(rest.tags) : rest.tags,
    breadcrumbs: rest.breadcrumbs?.map(scrubSentryBreadcrumb),
  } as E;
}

/** Scrubs one breadcrumb carried by an event that `beforeSend` is scrubbing. */
export function scrubSentryBreadcrumb<B extends BreadcrumbLike>(breadcrumb: B): B {
  const rest = breadcrumb as BreadcrumbLike & Record<string, unknown>;

  return {
    ...rest,
    message: rest.message === undefined ? undefined : redactString(rest.message),
    data: rest.data ? redactRecord(rest.data) : rest.data,
  } as B;
}
