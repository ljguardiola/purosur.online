import { createHash, randomBytes } from "node:crypto";

const SESSION_ID_BYTES = 32;

/** The only place the raw session id ever exists outside the browser's cookie jar. */
export function generateSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

/** The only form the cloud ever stores or looks a session up by; the raw id is never persisted. */
export function hashSessionId(rawSessionId: string): string {
  return createHash("sha256").update(rawSessionId).digest("base64url");
}
