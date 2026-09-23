// The `__Host-` prefix makes a browser reject any cookie of this name that carries a `Domain`
// attribute, so a sibling subdomain cannot plant one that would shadow this service's own.
export const SESSION_COOKIE_NAME = "__Host-backoffice_session";

/**
 * The session cookie's `Set-Cookie` value: `HttpOnly` (never readable by script, unlike
 * `localStorage`), `Secure`, `SameSite=Lax`, and `Path=/` with no `Domain` attribute (a single
 * origin, no subdomain sharing). Carries the raw session id; the database only ever stores its
 * hash (`hashSessionId`).
 */
export function serializeSessionCookie(rawSessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionId}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

/**
 * The `Set-Cookie` value that ends the session cookie in the browser: same attributes as
 * `serializeSessionCookie` (so the browser recognizes it as the same cookie) but with an empty
 * value and `Max-Age=0`, so the browser drops it immediately instead of waiting for it to expire.
 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Reads the raw session id back out of an incoming `Cookie` request header, if it was sent. */
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      return pair.slice(separatorIndex + 1).trim();
    }
  }
  return undefined;
}
