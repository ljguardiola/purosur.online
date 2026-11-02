import { describe, expect, it } from "vitest";
import type { ContingencyTimeMeasurement } from "./contingency-time-share.js";
import {
  monthAtRiskOfSecondConsecutiveBreach,
  NON_COMPLIANT_MEASUREMENTS,
  nonCompliantMeasurementsOfMonth,
} from "./second-consecutive-breach.js";

function contingencyTime(state: ContingencyTimeMeasurement["state"]): ContingencyTimeMeasurement {
  return { contingencyMs: 0, availableMs: 0, shareTenthsOfPercent: null, state };
}

describe("monthAtRiskOfSecondConsecutiveBreach", () => {
  it("is the month in progress, put at risk by a breach recorded for the month before it", () => {
    expect(monthAtRiskOfSecondConsecutiveBreach("2026-03-15")).toEqual({
      month: "2026-03",
      previousMonth: "2026-02",
    });
  });

  it("follows the previous December in January", () => {
    expect(monthAtRiskOfSecondConsecutiveBreach("2027-01-01")).toEqual({
      month: "2027-01",
      previousMonth: "2026-12",
    });
  });

  it("follows the previous month from the last day of a long month", () => {
    expect(monthAtRiskOfSecondConsecutiveBreach("2026-03-31")).toEqual({
      month: "2026-03",
      previousMonth: "2026-02",
    });
  });
});

describe("nonCompliantMeasurementsOfMonth", () => {
  it("names both measurements, in order, as the ones a month can fail", () => {
    expect(NON_COMPLIANT_MEASUREMENTS).toEqual(["exception_share", "contingency_time"]);
  });

  it("is empty for a month compliant on both measurements", () => {
    expect(
      nonCompliantMeasurementsOfMonth({
        exceptionShareRecorded: false,
        contingencyTime: contingencyTime("compliant"),
      }),
    ).toEqual([]);
  });

  it("names the exception share when its breach is recorded", () => {
    expect(
      nonCompliantMeasurementsOfMonth({
        exceptionShareRecorded: true,
        contingencyTime: contingencyTime("compliant"),
      }),
    ).toEqual(["exception_share"]);
  });

  it("names the contingency time when the month is non-compliant on it", () => {
    expect(
      nonCompliantMeasurementsOfMonth({
        exceptionShareRecorded: false,
        contingencyTime: contingencyTime("non_compliant"),
      }),
    ).toEqual(["contingency_time"]);
  });

  it("names both when both fail", () => {
    expect(
      nonCompliantMeasurementsOfMonth({
        exceptionShareRecorded: true,
        contingencyTime: contingencyTime("non_compliant"),
      }),
    ).toEqual(["exception_share", "contingency_time"]);
  });

  it.each(["in_progress", "no_data", "compliant"] as const)(
    "does not name the contingency time in state %s",
    (state) => {
      expect(
        nonCompliantMeasurementsOfMonth({
          exceptionShareRecorded: false,
          contingencyTime: contingencyTime(state),
        }),
      ).toEqual([]);
    },
  );
});
