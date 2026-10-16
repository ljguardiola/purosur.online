import { describe, expect, it } from "vitest";
import {
  areSnapshotLifecycleRulesWithinLimits,
  DEFAULT_SNAPSHOT_LIFECYCLE_RULES,
  SNAPSHOT_LIFECYCLE_LIMITS,
  SNAPSHOT_RECENT_GENERATIONS,
  snapshotLifecycleRulesOrDefault,
} from "./snapshot-lifecycle-rules.js";

describe("snapshot lifecycle rules", () => {
  it("always keeps the last 6 verified generations", () => {
    expect(SNAPSHOT_RECENT_GENERATIONS).toBe(6);
  });

  it("keeps 24 hours, 30 days and 12 months unless told otherwise", () => {
    expect(DEFAULT_SNAPSHOT_LIFECYCLE_RULES).toEqual({ hourly: 24, daily: 30, monthly: 12 });
  });

  it("allows 1 to 72 hours, 1 to 90 days and 1 to 24 months", () => {
    expect(SNAPSHOT_LIFECYCLE_LIMITS).toEqual({
      hourly: { min: 1, max: 72 },
      daily: { min: 1, max: 90 },
      monthly: { min: 1, max: 24 },
    });
  });

  describe("areSnapshotLifecycleRulesWithinLimits", () => {
    it.each([
      ["the smallest allowed rules", { hourly: 1, daily: 1, monthly: 1 }],
      ["the largest allowed rules", { hourly: 72, daily: 90, monthly: 24 }],
      ["the defaults", DEFAULT_SNAPSHOT_LIFECYCLE_RULES],
    ])("accepts %s", (_name, rules) => {
      expect(areSnapshotLifecycleRulesWithinLimits(rules)).toBe(true);
    });

    it.each([
      ["hours below the minimum", { hourly: 0, daily: 30, monthly: 12 }],
      ["hours above the maximum", { hourly: 73, daily: 30, monthly: 12 }],
      ["days below the minimum", { hourly: 24, daily: 0, monthly: 12 }],
      ["days above the maximum", { hourly: 24, daily: 91, monthly: 12 }],
      ["months below the minimum", { hourly: 24, daily: 30, monthly: 0 }],
      ["months above the maximum", { hourly: 24, daily: 30, monthly: 25 }],
      ["a fractional number of hours", { hourly: 1.5, daily: 30, monthly: 12 }],
      ["a fractional number of days", { hourly: 24, daily: 2.5, monthly: 12 }],
      ["a fractional number of months", { hourly: 24, daily: 30, monthly: 3.5 }],
      ["a number that is not finite", { hourly: Number.NaN, daily: 30, monthly: 12 }],
    ])("refuses %s", (_name, rules) => {
      expect(areSnapshotLifecycleRulesWithinLimits(rules)).toBe(false);
    });
  });

  describe("snapshotLifecycleRulesOrDefault", () => {
    it("answers the stored rules when there are some", () => {
      const stored = { hourly: 2, daily: 3, monthly: 4 };
      expect(snapshotLifecycleRulesOrDefault(stored)).toEqual(stored);
    });

    it("answers the defaults when none were stored", () => {
      expect(snapshotLifecycleRulesOrDefault(undefined)).toEqual(DEFAULT_SNAPSHOT_LIFECYCLE_RULES);
    });
  });
});
