import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNAPSHOT_LIFECYCLE_RULES,
  isValidSnapshotLifecycleRules,
  SNAPSHOT_LIFECYCLE_LIMITS,
  SNAPSHOT_RECENT_GENERATIONS,
} from "./snapshot-lifecycle-rules.js";

describe("snapshot lifecycle rules", () => {
  it("always keeps the last 6 verified generations", () => {
    expect(SNAPSHOT_RECENT_GENERATIONS).toBe(6);
  });

  it("keeps 24 hours, 30 days and 12 months unless told otherwise", () => {
    expect(DEFAULT_SNAPSHOT_LIFECYCLE_RULES).toEqual({ hourly: 24, daily: 30, monthly: 12 });
  });

  it("accepts the defaults", () => {
    expect(isValidSnapshotLifecycleRules(DEFAULT_SNAPSHOT_LIFECYCLE_RULES)).toBe(true);
  });

  it("allows 1 to 72 hours, 1 to 90 days and 1 to 24 months", () => {
    expect(SNAPSHOT_LIFECYCLE_LIMITS).toEqual({
      hourly: { min: 1, max: 72 },
      daily: { min: 1, max: 90 },
      monthly: { min: 1, max: 24 },
    });
  });

  it.each([
    [{ hourly: 1, daily: 1, monthly: 1 }, true],
    [{ hourly: 72, daily: 90, monthly: 24 }, true],
    [{ hourly: 0, daily: 30, monthly: 12 }, false],
    [{ hourly: 73, daily: 30, monthly: 12 }, false],
    [{ hourly: 24, daily: 0, monthly: 12 }, false],
    [{ hourly: 24, daily: 91, monthly: 12 }, false],
    [{ hourly: 24, daily: 30, monthly: 0 }, false],
    [{ hourly: 24, daily: 30, monthly: 25 }, false],
    [{ hourly: 24.5, daily: 30, monthly: 12 }, false],
    [{ hourly: 24, daily: 30.5, monthly: 12 }, false],
    [{ hourly: 24, daily: 30, monthly: 12.5 }, false],
  ])("judges %j valid: %s", (rules, valid) => {
    expect(isValidSnapshotLifecycleRules(rules)).toBe(valid);
  });
});
