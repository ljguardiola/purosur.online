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
  sentAt: Date | null;
}

export function supersedesRecoveryRequest(
  other: Pick<RecoveryRequest, "requestId" | "requestedAt">,
  request: Pick<RecoveryRequest, "requestId" | "requestedAt">,
): boolean {
  return (
    other.requestId !== request.requestId &&
    other.requestedAt.getTime() >= request.requestedAt.getTime()
  );
}

export function wasRecoveryRequestServed(
  requests: readonly Pick<RecoveryRequest, "requestId" | "sentAt">[],
  requestId: string,
): boolean {
  return requests.some((stored) => stored.requestId === requestId && stored.sentAt !== null);
}
