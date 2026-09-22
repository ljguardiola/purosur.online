export const SESSION_COOKIE_NAME = "backoffice_session";

/**
 * The session cookie's `Set-Cookie` value: `HttpOnly` (never readable by script, unlike
 * `localStorage`), `Secure`, `SameSite=Lax`, and `Path=/` with no `Domain` attribute (a single
 * origin, no subdomain sharing). Carries the raw session id; the database only ever stores its
 * hash (`hashSessionId`).
 */
export function serializeSessionCookie(rawSessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionId}; HttpOnly; Secure; SameSite=Lax; Path=/`;
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
