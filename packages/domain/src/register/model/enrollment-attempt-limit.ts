export const ENROLLMENT_ATTEMPT_LIMIT = 10;
export const ENROLLMENT_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

export function enrollmentAttemptWindowStart(now: Date): Date {
  return new Date(now.getTime() - ENROLLMENT_ATTEMPT_WINDOW_MS);
}

export function enrollmentAttemptRetryAfterSeconds(
  acceptedAttempts: readonly Date[],
  now: Date,
): number | undefined {
  const windowStart = enrollmentAttemptWindowStart(now);
  const oldestCounted = acceptedAttempts
    .filter((attemptedAt) => attemptedAt > windowStart)
    .sort((a, b) => b.getTime() - a.getTime())[ENROLLMENT_ATTEMPT_LIMIT - 1];
  if (oldestCounted === undefined) {
    return undefined;
  }
  return Math.ceil((oldestCounted.getTime() + ENROLLMENT_ATTEMPT_WINDOW_MS - now.getTime()) / 1000);
}
