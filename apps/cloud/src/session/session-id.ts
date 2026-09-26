import { createHash, randomBytes } from "node:crypto";

const SESSION_ID_BYTES = 32;

/** 256 bits of CSPRNG randomness; the only place the raw id ever exists outside the browser's cookie jar. */
export function generateSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

/** SHA-256, base64url-encoded: the only form the cloud ever stores or looks a session up by. */
export function hashSessionId(rawSessionId: string): string {
  return createHash("sha256").update(rawSessionId).digest("base64url");
}
