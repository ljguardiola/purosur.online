export const PIN_CODE_REDEMPTION_ATTEMPT_LIMIT = 10;
export const PIN_CODE_REDEMPTION_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

export function pinCodeRedemptionAttemptWindowStart(now: Date): Date {
  return new Date(now.getTime() - PIN_CODE_REDEMPTION_ATTEMPT_WINDOW_MS);
}

export function pinCodeRedemptionAttemptRetryAfterSeconds(
  acceptedAttempts: readonly Date[],
  now: Date,
): number | undefined {
  const windowStart = pinCodeRedemptionAttemptWindowStart(now);
  const oldestCounted = acceptedAttempts
    .filter((attemptedAt) => attemptedAt > windowStart)
    .sort((a, b) => b.getTime() - a.getTime())[PIN_CODE_REDEMPTION_ATTEMPT_LIMIT - 1];
  if (oldestCounted === undefined) {
    return undefined;
  }
  return Math.ceil(
    (oldestCounted.getTime() + PIN_CODE_REDEMPTION_ATTEMPT_WINDOW_MS - now.getTime()) / 1000,
  );
}
