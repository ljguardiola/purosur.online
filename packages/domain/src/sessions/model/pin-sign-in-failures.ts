export const PIN_SIGN_IN_LOCKOUT_FAILURES = 8;
export const PIN_SIGN_IN_MAX_DELAY_SECONDS = 30;
const FAILURES_WITHOUT_DELAY = 2;

export function pinSignInDelaySeconds(consecutiveFailures: number): number {
  if (consecutiveFailures <= FAILURES_WITHOUT_DELAY) {
    return 0;
  }
  return Math.min(
    2 ** (consecutiveFailures - FAILURES_WITHOUT_DELAY - 1),
    PIN_SIGN_IN_MAX_DELAY_SECONDS,
  );
}

export function isLockedOutOfPinSignIn(consecutiveFailures: number): boolean {
  return consecutiveFailures >= PIN_SIGN_IN_LOCKOUT_FAILURES;
}

export function pinSignInAttemptsLeft(consecutiveFailures: number): number {
  return Math.max(PIN_SIGN_IN_LOCKOUT_FAILURES - consecutiveFailures, 0);
}

export function pinSignInRetryAfterSeconds(
  consecutiveFailures: number,
  lastFailedAt: Date,
  now: Date,
): number {
  const elapsedSeconds = Math.max(now.getTime() - lastFailedAt.getTime(), 0) / 1000;
  return Math.max(Math.ceil(pinSignInDelaySeconds(consecutiveFailures) - elapsedSeconds), 0);
}
