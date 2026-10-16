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

function isWithin(value: number, { min, max }: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function areSnapshotLifecycleRulesWithinLimits(rules: SnapshotLifecycleRules): boolean {
  return (
    isWithin(rules.hourly, SNAPSHOT_LIFECYCLE_LIMITS.hourly) &&
    isWithin(rules.daily, SNAPSHOT_LIFECYCLE_LIMITS.daily) &&
    isWithin(rules.monthly, SNAPSHOT_LIFECYCLE_LIMITS.monthly)
  );
}

export function snapshotLifecycleRulesOrDefault(
  stored: SnapshotLifecycleRules | undefined,
): SnapshotLifecycleRules {
  return stored ?? DEFAULT_SNAPSHOT_LIFECYCLE_RULES;
}
