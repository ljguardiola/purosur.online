export const ALERT_CONDITION_EVALUATION_INTERVAL_MS = 60 * 1000;

export const ALERT_CONDITION_STABLE_CLEAR_MS = 10 * 60 * 1000;

export function isStablyCleared(conditionClearedAt: Date, now: Date): boolean {
  return now.getTime() - conditionClearedAt.getTime() >= ALERT_CONDITION_STABLE_CLEAR_MS;
}
