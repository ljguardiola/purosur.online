export const SIGN_IN_LOOKUP_ATTEMPT_LIMIT = 10;
export const SIGN_IN_LOOKUP_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

export function signInLookupAttemptWindowStart(now: Date): Date {
  return new Date(now.getTime() - SIGN_IN_LOOKUP_ATTEMPT_WINDOW_MS);
}

export function signInLookupAttemptRetryAfterSeconds(
  acceptedAttempts: readonly Date[],
  now: Date,
): number | undefined {
  const windowStart = signInLookupAttemptWindowStart(now);
  const oldestCounted = acceptedAttempts
    .filter((attemptedAt) => attemptedAt > windowStart)
    .sort((a, b) => b.getTime() - a.getTime())[SIGN_IN_LOOKUP_ATTEMPT_LIMIT - 1];
  if (oldestCounted === undefined) {
    return undefined;
  }
  return Math.ceil(
    (oldestCounted.getTime() + SIGN_IN_LOOKUP_ATTEMPT_WINDOW_MS - now.getTime()) / 1000,
  );
}
