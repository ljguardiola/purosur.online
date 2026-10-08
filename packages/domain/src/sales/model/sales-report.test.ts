import { describe, expect, it } from "vitest";
import {
  defaultSalesReportRange,
  isSalesReportRangeAsked,
  SALES_REPORT_SALE_STATE,
  salesReportTotals,
} from "./sales-report.js";

describe("isSalesReportRangeAsked", () => {
  it("accepts no range at all, which asks for the current day", () => {
    expect(isSalesReportRangeAsked({ from: undefined, to: undefined })).toBe(true);
  });

  it("accepts a range of several days", () => {
    expect(isSalesReportRangeAsked({ from: "2026-10-01", to: "2026-10-06" })).toBe(true);
  });

  it("accepts a range of a single day", () => {
    expect(isSalesReportRangeAsked({ from: "2026-10-06", to: "2026-10-06" })).toBe(true);
  });

  it("refuses a range that ends before it starts", () => {
    expect(isSalesReportRangeAsked({ from: "2026-10-06", to: "2026-10-05" })).toBe(false);
  });

  it("refuses a range with only its start", () => {
    expect(isSalesReportRangeAsked({ from: "2026-10-06", to: undefined })).toBe(false);
  });

  it("refuses a range with only its end", () => {
    expect(isSalesReportRangeAsked({ from: undefined, to: "2026-10-06" })).toBe(false);
  });

  it.each([
    ["2026-02-30", "2026-03-02"],
    ["2026-10-01", "2026-13-01"],
    ["2026-10-01", "06/10/2026"],
    ["2026-10-01", "2026-10-06T10:00:00Z"],
  ])("refuses a bound that is not a calendar day (%s to %s)", (from, to) => {
    expect(isSalesReportRangeAsked({ from, to })).toBe(false);
  });
});

describe("defaultSalesReportRange", () => {
  it("is the current Argentina calendar day", () => {
    expect(defaultSalesReportRange(new Date("2026-10-06T15:00:00.000Z"))).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("is still the previous day after midnight UTC, until midnight in Argentina", () => {
    expect(defaultSalesReportRange(new Date("2026-10-07T02:59:00.000Z"))).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
    });
  });

  it("changes day at midnight in Argentina", () => {
    expect(defaultSalesReportRange(new Date("2026-10-07T03:00:00.000Z"))).toEqual({
      from: "2026-10-07",
      to: "2026-10-07",
    });
  });
});

describe("salesReportTotals", () => {
  it("adds up the sales and the amounts of every day", () => {
    expect(
      salesReportTotals([
        { day: "2026-10-05", salesCount: 3, total: 12_500 },
        { day: "2026-10-06", salesCount: 2, total: 4_800 },
      ]),
    ).toEqual({ salesCount: 5, total: 17_300 });
  });

  it("is zero for a range without sales", () => {
    expect(salesReportTotals([])).toEqual({ salesCount: 0, total: 0 });
  });
});

describe("the sales report", () => {
  it("counts the completed sales and no other", () => {
    expect(SALES_REPORT_SALE_STATE).toBe("COMPLETED");
  });
});
