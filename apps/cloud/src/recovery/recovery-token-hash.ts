import { createHash } from "node:crypto";

/**
 * SHA-256 of the raw recovery token, base64url-encoded: the only form the cloud ever stores or
 * looks a token up by (§11, D44 "guardado en la nube solo como hash"). Shared by the issuing
 * side (`process-recovery-request-job.ts`) and the redeeming side (T2) so both hash the same way.
 */
export function hashRecoveryToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}
