export const SIGN_IN_FAILURE_LIMIT = 10;
export const SIGN_IN_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;
export const SIGN_IN_BLOCK_DURATION_MS = 15 * 60 * 1000;

export function signInLockoutWindowStart(now: Date): Date {
  return new Date(now.getTime() - SIGN_IN_LOCKOUT_WINDOW_MS);
}

export function hasReachedSignInFailureLimit(failureCount: number): boolean {
  return failureCount >= SIGN_IN_FAILURE_LIMIT;
}

export function signInBlockedUntil(now: Date): Date {
  return new Date(now.getTime() + SIGN_IN_BLOCK_DURATION_MS);
}

export function isSignInBlockLive(blockedUntil: Date, now: Date): boolean {
  return blockedUntil.getTime() > now.getTime();
}
