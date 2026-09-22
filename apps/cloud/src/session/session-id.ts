import { createHash, randomBytes } from "node:crypto";

const SESSION_ID_BYTES = 32;

/**
 * A fresh, opaque session id: 256 bits of CSPRNG randomness, base64url-encoded so it drops
 * straight into a cookie value. This is the only place the raw id ever exists outside the
 * browser's cookie jar; `sessions.session_id_hash` stores only its hash (`hashSessionId` below).
 */
export function generateSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

/**
 * SHA-256 of the raw session id, base64url-encoded the same way `hashRecoveryToken` hashes a
 * recovery token: the only form the cloud ever stores or looks a session up by.
 */
export function hashSessionId(rawSessionId: string): string {
  return createHash("sha256").update(rawSessionId).digest("base64url");
}
