import { createHash } from "node:crypto";

/**
 * SHA-256 of the raw recovery token, base64url-encoded: the only form the cloud ever stores or
 * looks a token up by. Shared by the issuing side (`process-recovery-request-job.ts`) and the
 * redeeming side (`recovery-redemption-route.ts`) so both hash the same way.
 */
export function hashRecoveryToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}
