import { describe, expect, it } from "vitest";
import { defaultReportPeriod, isReportPeriodAsked } from "./report-period.js";

describe("isReportPeriodAsked", () => {
  it("accepts no range at all, which asks for the current day", () => {
    expect(isReportPeriodAsked({ from: undefined, to: undefined })).toBe(true);
  });

  it("accepts a range of several days", () => {
    expect(isReportPeriodAsked({ from: "2026-10-01", to: "2026-10-06" })).toBe(true);
  });

  it("accepts a range of a single day", () => {
    expect(isReportPeriodAsked({ from: "2026-10-06", to: "2026-10-06" })).toBe(true);
  });

  it("refuses a range that ends before it starts", () => {
    expect(isReportPeriodAsked({ from: "2026-10-06", to: "2026-10-05" })).toBe(false);
  });

  it("refuses a range with only its start", () => {
    expect(isReportPeriodAsked({ from: "2026-10-06", to: undefined })).toBe(false);
  });

  it("refuses a range with only its end", () => {
    expect(isReportPeriodAsked({ from: undefined, to: "2026-10-06" })).toBe(false);
  });

  it.each([
    ["2026-02-30", "2026-03-02"],
    ["2026-10-01", "2026-13-01"],
    ["2026-10-01", "06/10/2026"],
    ["2026-10-01", "2026-10-06T10:00:00Z"],
  ])("refuses a bound that is not a calendar day (%s to %s)", (from, to) => {
    expect(isReportPeriodAsked({ from, to })).toBe(false);
  });
});

describe("defaultReportPeriod", () => {
  it("is the current Argentina calendar day", () => {
    expect(defaultReportPeriod(new Date("2026-10-06T15:00:00.000Z"))).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("is still the previous day after midnight UTC, until midnight in Argentina", () => {
    expect(defaultReportPeriod(new Date("2026-10-07T02:59:00.000Z"))).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("changes day at midnight in Argentina", () => {
    expect(defaultReportPeriod(new Date("2026-10-07T03:00:00.000Z"))).toEqual({
      from: "2026-10-07",
      to: "2026-10-07",
    });
  });
});
