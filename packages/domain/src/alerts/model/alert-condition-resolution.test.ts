import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALERT_CONDITION_STABLE_CLEAR_MS, isStablyCleared } from "./alert-condition-resolution.js";

const CLEARED_AT = new Date("2026-10-01T08:00:00.000Z");

describe("ALERT_CONDITION_STABLE_CLEAR_MS", () => {
  it("is 10 minutes", () => {
    expect(ALERT_CONDITION_STABLE_CLEAR_MS).toBe(10 * 60 * 1000);
  });
});

describe("isStablyCleared", () => {
  it("is false one millisecond before the condition has stayed cleared for 10 minutes", () => {
    const now = new Date(CLEARED_AT.getTime() + ALERT_CONDITION_STABLE_CLEAR_MS - 1);

    expect(isStablyCleared(CLEARED_AT, now)).toBe(false);
  });

  it("is true once the condition has stayed cleared for exactly 10 minutes", () => {
    const now = new Date(CLEARED_AT.getTime() + ALERT_CONDITION_STABLE_CLEAR_MS);

    expect(isStablyCleared(CLEARED_AT, now)).toBe(true);
  });

  it("is true for any longer time and false for any shorter one", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 10_000_000 }), (elapsedMs) => {
        const now = new Date(CLEARED_AT.getTime() + elapsedMs);

        expect(isStablyCleared(CLEARED_AT, now)).toBe(elapsedMs >= ALERT_CONDITION_STABLE_CLEAR_MS);
      }),
    );
  });
});
