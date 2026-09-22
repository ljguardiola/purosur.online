export type RecoveryTokenErrorStatus = "invalid" | "burned" | "expired";

export interface RecoveryTokenErrorResponse {
  statusCode: number;
  code: "recovery_token_invalid" | "recovery_token_burned" | "recovery_token_expired";
  message: string;
}

/**
 * Maps a `classifyRecoveryToken` outcome to the response `registration-options` and `redeem`
 * both give (§9.7, D44, issue #167 — the doc names no HTTP status for these codes; T2 technical
 * decision: 404 for an unrecognized token, 409 for one already burned — the same status the doc's
 * own `idempotency_key_already_used`/`order_already_canceled` conflicts use — and 410 Gone for one
 * past its expiry).
 */
export function recoveryTokenErrorResponse(
  status: RecoveryTokenErrorStatus,
): RecoveryTokenErrorResponse {
  switch (status) {
    case "invalid":
      return {
        statusCode: 404,
        code: "recovery_token_invalid",
        message: "the recovery link is not recognized",
      };
    case "burned":
      return {
        statusCode: 409,
        code: "recovery_token_burned",
        message: "the recovery link was already used or replaced by a newer one",
      };
    case "expired":
      return {
        statusCode: 410,
        code: "recovery_token_expired",
        message: "the recovery link has expired",
      };
  }
}
