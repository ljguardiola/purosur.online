import { describe, expect, it } from "vitest";
import {
  isReplenishmentRetryable,
  type ReplenishmentFailure,
  replenishmentFailedReportOf,
} from "./replenishment-failure.js";

const REFUSED: ReplenishmentFailure = { kind: "refused", refusal: "predecessor_not_of_register" };

function unreadableBy(appVersion: string | null): ReplenishmentFailure {
  return { kind: "unreadable_event", eventId: "event-1", reason: "unknown fact", appVersion };
}

describe("isReplenishmentRetryable", () => {
  it.each(["1.0.0", "1.0.1", "2.0.0", null])(
    "never retries a refusal, even on version %s",
    (currentVersion) => {
      expect(isReplenishmentRetryable(REFUSED, currentVersion)).toBe(false);
    },
  );

  it.each([
    ["1.4.1", "1.4.0"],
    ["1.5.0", "1.4.9"],
    ["2.0.0", "1.99.99"],
    ["1.10.0", "1.9.0"],
  ])(
    "retries an unreadable event on %s, newer than the %s that could not read it",
    (current, failed) => {
      expect(isReplenishmentRetryable(unreadableBy(failed), current)).toBe(true);
    },
  );

  it.each([
    ["1.4.0", "1.4.0"],
    ["1.3.9", "1.4.0"],
    ["1.9.0", "1.10.0"],
  ])(
    "holds an unreadable event on %s, not newer than the %s that could not read it",
    (current, failed) => {
      expect(isReplenishmentRetryable(unreadableBy(failed), current)).toBe(false);
    },
  );

  it("holds an unreadable event when either version is unknown", () => {
    expect(isReplenishmentRetryable(unreadableBy(null), "2.0.0")).toBe(false);
    expect(isReplenishmentRetryable(unreadableBy("1.0.0"), null)).toBe(false);
  });
});

describe("replenishmentFailedReportOf", () => {
  it("reports no failure for a replenishment that has not failed", () => {
    expect(replenishmentFailedReportOf(undefined)).toEqual({ replenishment_failed: false });
  });

  it("reports the kind of the failure", () => {
    expect(replenishmentFailedReportOf(REFUSED)).toEqual({ replenishment_failed: "refused" });
    expect(replenishmentFailedReportOf(unreadableBy("1.0.0"))).toEqual({
      replenishment_failed: "unreadable_event",
    });
  });
});
