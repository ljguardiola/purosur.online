export const RECOVERY_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RECOVERY_DESTINATION_ADDRESS_LIMIT = 5;
export const RECOVERY_SOURCE_ADDRESS_LIMIT = 10;
export const RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT = 10;

export function recoveryRateLimitWindowStart(now: Date): Date {
  return new Date(now.getTime() - RECOVERY_RATE_LIMIT_WINDOW_MS);
}
