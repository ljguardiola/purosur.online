export const SNAPSHOT_RECENT_GENERATIONS = 6;

export interface SnapshotLifecycleRules {
  hourly: number;
  daily: number;
  monthly: number;
}

export const DEFAULT_SNAPSHOT_LIFECYCLE_RULES: SnapshotLifecycleRules = {
  hourly: 24,
  daily: 30,
  monthly: 12,
};

export const SNAPSHOT_LIFECYCLE_LIMITS = {
  hourly: { min: 1, max: 72 },
  daily: { min: 1, max: 90 },
  monthly: { min: 1, max: 24 },
} as const;

function isWithinLimits(value: number, limits: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= limits.min && value <= limits.max;
}

export function isValidSnapshotLifecycleRules(rules: SnapshotLifecycleRules): boolean {
  return (
    isWithinLimits(rules.hourly, SNAPSHOT_LIFECYCLE_LIMITS.hourly) &&
    isWithinLimits(rules.daily, SNAPSHOT_LIFECYCLE_LIMITS.daily) &&
    isWithinLimits(rules.monthly, SNAPSHOT_LIFECYCLE_LIMITS.monthly)
  );
}
