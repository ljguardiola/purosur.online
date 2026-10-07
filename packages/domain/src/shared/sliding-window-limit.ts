export interface SlidingWindowLimit {
  limit: number;
  windowMs: number;
}

export function slidingWindowStart(
  now: Date,
  { windowMs }: Pick<SlidingWindowLimit, "windowMs">,
): Date {
  return new Date(now.getTime() - windowMs);
}

export function slidingWindowRetryAfterSeconds(
  acceptedAttempts: readonly Date[],
  now: Date,
  policy: SlidingWindowLimit,
): number | undefined {
  const windowStart = slidingWindowStart(now, policy);
  const oldestCounted = acceptedAttempts
    .filter((attemptedAt) => attemptedAt > windowStart)
    .sort((a, b) => b.getTime() - a.getTime())[policy.limit - 1];
  if (oldestCounted === undefined) {
    return undefined;
  }
  return Math.ceil((oldestCounted.getTime() + policy.windowMs - now.getTime()) / 1000);
}
