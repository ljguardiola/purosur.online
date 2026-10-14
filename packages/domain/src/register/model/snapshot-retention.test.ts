import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPSHOT_LIFECYCLE_RULES } from "./snapshot-lifecycle-rules.js";
import {
  type RetainableSnapshotGeneration,
  snapshotGenerationsToPrune,
} from "./snapshot-retention.js";

const NOW = new Date("2026-10-14T15:30:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function verified(id: string, createdAt: Date): RetainableSnapshotGeneration {
  return { id, createdAt, status: "verified" };
}

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function newest6(): RetainableSnapshotGeneration[] {
  return Array.from({ length: 6 }, (_, index) => verified(`recent${index}`, minutesBefore(index)));
}

function pruned(
  generations: RetainableSnapshotGeneration[],
  rules = DEFAULT_SNAPSHOT_LIFECYCLE_RULES,
  frozen = false,
): string[] {
  return snapshotGenerationsToPrune(generations, rules, NOW, frozen).sort();
}

describe("snapshotGenerationsToPrune", () => {
  it("prunes nothing when there are no generations", () => {
    expect(pruned([])).toEqual([]);
  });

  it("keeps the 6 newest verified generations even when they share an hour", () => {
    const generations = Array.from({ length: 8 }, (_, index) =>
      verified(`g${index}`, minutesBefore(index)),
    );
    expect(pruned(generations, { hourly: 1, daily: 1, monthly: 1 })).toEqual(["g6", "g7"].sort());
  });

  it("keeps only the newest verified generation of each hour beyond the newest 6", () => {
    const recent = newest6();
    const earlierSameHour = [
      verified("hour-old-newest", minutesBefore(130)),
      verified("hour-old-older", minutesBefore(140)),
    ];
    expect(pruned([...recent, ...earlierSameHour], { hourly: 24, daily: 1, monthly: 1 })).toEqual([
      "hour-old-older",
    ]);
  });

  it("stops keeping hourly generations past the configured number of hours", () => {
    const generations = [...newest6(), verified("three-hours-ago", minutesBefore(180))];
    expect(pruned(generations, { hourly: 2, daily: 1, monthly: 1 })).toEqual(["three-hours-ago"]);
    expect(pruned(generations, { hourly: 4, daily: 1, monthly: 1 })).toEqual([]);
  });

  it("counts the current hour as the first of the configured hours", () => {
    const generations = [...newest6(), verified("two-hours-back", minutesBefore(120))];
    expect(pruned(generations, { hourly: 2, daily: 1, monthly: 1 })).toEqual(["two-hours-back"]);
    expect(pruned(generations, { hourly: 3, daily: 1, monthly: 1 })).toEqual([]);
  });

  it("counts hours, days and months on Argentina's calendar", () => {
    const recent = newest6();
    const lateOnTheThirteenth = verified("late-13th", new Date("2026-10-14T01:30:00.000Z"));
    const earlyOnTheThirteenth = verified("early-13th", new Date("2026-10-13T04:00:00.000Z"));
    expect(
      pruned([...recent, lateOnTheThirteenth, earlyOnTheThirteenth], {
        hourly: 1,
        daily: 2,
        monthly: 1,
      }),
    ).toEqual(["early-13th"]);
  });

  it("keeps the newest verified generation of each of the last days", () => {
    const recent = newest6();
    const days = [1, 2, 3].flatMap((back) => [
      verified(`day${back}-newest`, new Date(NOW.getTime() - back * DAY_MS)),
      verified(`day${back}-older`, new Date(NOW.getTime() - back * DAY_MS - HOUR_MS)),
    ]);
    expect(pruned([...recent, ...days], { hourly: 1, daily: 3, monthly: 1 })).toEqual(
      ["day1-older", "day2-older", "day3-older", "day3-newest"].sort(),
    );
  });

  it("keeps the newest verified generation of each of the last months", () => {
    const recent = newest6();
    const generations = [
      ...recent,
      verified("september-newest", new Date("2026-09-20T12:00:00.000Z")),
      verified("september-older", new Date("2026-09-02T12:00:00.000Z")),
      verified("august", new Date("2026-08-15T12:00:00.000Z")),
    ];
    expect(pruned(generations, { hourly: 1, daily: 1, monthly: 2 })).toEqual([
      "august",
      "september-older",
    ]);
  });

  it("keeps the months of a year ago across the year boundary", () => {
    const generations = [
      ...newest6(),
      verified("december", new Date("2025-12-15T12:00:00.000Z")),
      verified("november", new Date("2025-11-15T12:00:00.000Z")),
    ];
    expect(pruned(generations, { hourly: 1, daily: 1, monthly: 11 })).toEqual(["november"]);
  });

  it("never prunes a generation still awaiting verification", () => {
    const awaiting: RetainableSnapshotGeneration[] = [
      { id: "declared", createdAt: minutesBefore(90 * 24 * 60), status: "declared" },
      { id: "uploaded", createdAt: minutesBefore(90 * 24 * 60), status: "uploaded" },
    ];
    expect(pruned(awaiting)).toEqual([]);
  });

  it("does not let a generation awaiting verification take a retained place", () => {
    const generations: RetainableSnapshotGeneration[] = [
      { id: "uploaded", createdAt: minutesBefore(1), status: "uploaded" },
      ...Array.from({ length: 7 }, (_, index) => verified(`g${index}`, minutesBefore(2 + index))),
    ];
    expect(pruned(generations, { hourly: 1, daily: 1, monthly: 1 })).toEqual(["g6"]);
  });

  it("always prunes a failed generation", () => {
    const failed: RetainableSnapshotGeneration = {
      id: "failed",
      createdAt: minutesBefore(1),
      status: "failed",
    };
    expect(pruned([failed, verified("ok", minutesBefore(2))])).toEqual(["failed"]);
  });

  it("prunes nothing while retention is frozen", () => {
    const generations = [
      { id: "failed", createdAt: minutesBefore(1), status: "failed" as const },
      ...Array.from({ length: 10 }, (_, index) => verified(`g${index}`, minutesBefore(index * 3))),
    ];
    expect(pruned(generations, { hourly: 1, daily: 1, monthly: 1 }, true)).toEqual([]);
  });

  it("never prunes the newest verified generation", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 400 * 24 * 60 }), { minLength: 1, maxLength: 40 }),
        fc.record({
          hourly: fc.integer({ min: 1, max: 72 }),
          daily: fc.integer({ min: 1, max: 90 }),
          monthly: fc.integer({ min: 1, max: 24 }),
        }),
        (agesInMinutes, rules) => {
          const generations = agesInMinutes.map((age, index) =>
            verified(`g${index}`, minutesBefore(age)),
          );
          const newest = generations.reduce((best, candidate) =>
            candidate.createdAt > best.createdAt ? candidate : best,
          );
          expect(snapshotGenerationsToPrune(generations, rules, NOW, false)).not.toContain(
            newest.id,
          );
        },
      ),
    );
  });
});
