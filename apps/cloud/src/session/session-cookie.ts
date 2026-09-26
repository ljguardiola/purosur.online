// The `__Host-` prefix makes a browser reject any cookie of this name that carries a `Domain`
// attribute, so a sibling subdomain cannot plant one that would shadow this service's own.
export const SESSION_COOKIE_NAME = "__Host-backoffice_session";

/** The database only ever stores this id's hash (`hashSessionId`), never the raw value. */
export function serializeSessionCookie(rawSessionId: string): string {
  return `${SESSION_COOKIE_NAME}=${rawSessionId}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

/** Same attributes as `serializeSessionCookie`, so the browser recognizes it as the same cookie, but empty with `Max-Age=0` so it's dropped immediately. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// A browser holds at most one cookie of this name; a second one can only be a planted nameless
// cookie whose value spells the name (accepted by browsers older than RFC 6265bis), so neither is trusted.
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  let sessionId: string | undefined;
  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      if (sessionId !== undefined) {
        return undefined;
      }
      sessionId = pair.slice(separatorIndex + 1).trim();
    }
  }
  return sessionId;
}
