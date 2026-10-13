import { describe, expect, it } from "vitest";
import {
  SALES_REPORT_SALE_STATE,
  salesReportTotals,
} from "./sales-report.js";

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
