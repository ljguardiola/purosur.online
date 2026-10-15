import { argentinaCalendarDay, shiftCalendarDay } from "../../shared/index.js";
import type { SnapshotGenerationStatus } from "./snapshot-generation.js";
import {
  SNAPSHOT_RECENT_GENERATIONS,
  type SnapshotLifecycleRules,
} from "./snapshot-lifecycle-rules.js";

export interface RetainableSnapshotGeneration {
  id: string;
  createdAt: Date;
  status: SnapshotGenerationStatus;
}

const HOUR_MS = 60 * 60 * 1000;

// Argentina's offset from UTC is a whole number of hours, so its calendar hours are UTC's.
function hourOf(instant: Date): number {
  return Math.floor(instant.getTime() / HOUR_MS);
}

function monthOf(day: string): number {
  const [year = 0, month = 1] = day.split("-").map(Number);
  return year * 12 + month;
}

function newestFirst(a: RetainableSnapshotGeneration, b: RetainableSnapshotGeneration): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
}

function newestOfEachBucket(
  generations: readonly RetainableSnapshotGeneration[],
  bucketOf: (generation: RetainableSnapshotGeneration) => string | number,
  isWanted: (bucket: string | number) => boolean,
): string[] {
  const kept = new Map<string | number, string>();
  for (const generation of generations) {
    const bucket = bucketOf(generation);
    if (isWanted(bucket) && !kept.has(bucket)) {
      kept.set(bucket, generation.id);
    }
  }
  return [...kept.values()];
}

const SNAPSHOT_RETENTION_TIERS = ["recent", "hourly", "daily", "monthly"] as const;

export type SnapshotRetentionTier = (typeof SNAPSHOT_RETENTION_TIERS)[number];

export type SnapshotRetentionTiers = Record<SnapshotRetentionTier, string[]>;

export function snapshotRetentionTiers(
  generations: readonly RetainableSnapshotGeneration[],
  rules: SnapshotLifecycleRules,
  now: Date,
): SnapshotRetentionTiers {
  const byNewest = generations
    .filter((generation) => generation.status === "verified")
    .sort(newestFirst);

  const currentHour = hourOf(now);
  const today = argentinaCalendarDay(now);
  const keptDays = new Set(
    Array.from({ length: rules.daily }, (_, back) => shiftCalendarDay(today, -back)),
  );
  const currentMonth = monthOf(today);

  return {
    recent: byNewest.slice(0, SNAPSHOT_RECENT_GENERATIONS).map((generation) => generation.id),
    hourly: newestOfEachBucket(
      byNewest,
      (generation) => hourOf(generation.createdAt),
      (hour) => typeof hour === "number" && hour > currentHour - rules.hourly,
    ),
    daily: newestOfEachBucket(
      byNewest,
      (generation) => argentinaCalendarDay(generation.createdAt),
      (day) => keptDays.has(String(day)),
    ),
    monthly: newestOfEachBucket(
      byNewest,
      (generation) => monthOf(argentinaCalendarDay(generation.createdAt)),
      (month) => typeof month === "number" && month > currentMonth - rules.monthly,
    ),
  };
}

export function snapshotGenerationsToPrune(
  generations: readonly RetainableSnapshotGeneration[],
  rules: SnapshotLifecycleRules,
  now: Date,
  retentionFrozen: boolean,
): string[] {
  if (retentionFrozen) {
    return [];
  }
  const tiers = snapshotRetentionTiers(generations, rules, now);
  const kept = new Set<string>(SNAPSHOT_RETENTION_TIERS.flatMap((tier) => tiers[tier]));

  return generations
    .filter(
      (generation) =>
        generation.status === "failed" ||
        (generation.status === "verified" && !kept.has(generation.id)),
    )
    .map((generation) => generation.id);
}
