import { describe, expect, it } from "vitest";
import { salesReportSchema } from "./sales-report.js";

describe("salesReportSchema", () => {
  const report = {
    range: { from: "2026-10-05", to: "2026-10-06" },
    days: [
      { day: "2026-10-05", sales_count: 3, total: 12_500 },
      { day: "2026-10-06", sales_count: 2, total: 4_800 },
    ],
    totals: { sales_count: 5, total: 17_300 },
  };

  it("accepts the days of a range with their totals", () => {
    expect(salesReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without sales", () => {
    const empty = { ...report, days: [], totals: { sales_count: 0, total: 0 } };

    expect(salesReportSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    [
      "a day that is not a calendar day",
      { days: [{ day: "2026-02-30", sales_count: 1, total: 1 }] },
    ],
    ["a negative count", { days: [{ day: "2026-10-05", sales_count: -1, total: 1 }] }],
    ["an amount with decimals", { days: [{ day: "2026-10-05", sales_count: 1, total: 10.5 }] }],
    ["a total that is not an amount", { totals: { sales_count: 5, total: "17300" } }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(salesReportSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
