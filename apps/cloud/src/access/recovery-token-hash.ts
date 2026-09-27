import { createHash } from "node:crypto";

/** The only form a token is ever stored or looked up by; the issuing and redeeming sides must
 * hash identically. */
export function hashRecoveryToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}
