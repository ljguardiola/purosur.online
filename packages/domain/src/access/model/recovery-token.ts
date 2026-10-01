export const RECOVERY_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

export type RecoveryTokenStatus = "burned" | "expired" | "valid";

export interface RecoveryTokenState {
  expiresAt: Date;
  usedAt: Date | null;
  voidedAt: Date | null;
}

export function recoveryTokenExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + RECOVERY_TOKEN_LIFETIME_MS);
}

export function recoveryTokenStatus(token: RecoveryTokenState, at: Date): RecoveryTokenStatus {
  if (token.usedAt !== null || token.voidedAt !== null) {
    return "burned";
  }
  if (token.expiresAt.getTime() <= at.getTime()) {
    return "expired";
  }
  return "valid";
}

export interface RecoveryRequest {
  requestId: string;
  requestedAt: Date;
}

export function supersedesRecoveryRequest(
  other: RecoveryRequest,
  request: RecoveryRequest,
): boolean {
  return (
    other.requestId !== request.requestId &&
    other.requestedAt.getTime() >= request.requestedAt.getTime()
  );
}
