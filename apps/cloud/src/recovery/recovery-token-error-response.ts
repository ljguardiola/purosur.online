export type RecoveryTokenErrorStatus = "invalid" | "burned" | "expired";

export interface RecoveryTokenErrorResponse {
  statusCode: number;
  code: "recovery_token_invalid" | "recovery_token_burned" | "recovery_token_expired";
  message: string;
}

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
