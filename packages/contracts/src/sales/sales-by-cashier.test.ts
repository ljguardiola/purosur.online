import { describe, expect, it } from "vitest";
import { salesByCashierSchema } from "./sales-by-cashier.js";

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  rows: [
    {
      cashier_id: "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77",
      name: "Ana",
      sessions: 2,
      sales_count: 3,
      total: 10_000,
      average_ticket: 3_333,
    },
    {
      cashier_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      name: null,
      sessions: 1,
      sales_count: 1,
      total: 500,
      average_ticket: 500,
    },
  ],
  totals: { cashiers: 2, sales_count: 4, total: 10_500, average_ticket: 2_625 },
};

describe("salesByCashierSchema", () => {
  it("accepts the cashiers of a range with their totals", () => {
    expect(salesByCashierSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without sales, which has no average ticket", () => {
    const empty = {
      ...report,
      rows: [],
      totals: { cashiers: 0, sales_count: 0, total: 0, average_ticket: null },
    };

    expect(salesByCashierSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a row without an average ticket", () => {
    const row = { ...report.rows[0], average_ticket: null };

    expect(salesByCashierSchema.safeParse({ ...report, rows: [row] }).success).toBe(true);
  });

  it.each([
    ["an empty cashier id", { rows: [{ ...report.rows[0], cashier_id: "" }] }],
    ["a missing name", { rows: [{ ...report.rows[0], name: undefined }] }],
    ["a negative session count", { rows: [{ ...report.rows[0], sessions: -1 }] }],
    ["a sales count with decimals", { rows: [{ ...report.rows[0], sales_count: 1.5 }] }],
    ["an amount with decimals", { rows: [{ ...report.rows[0], total: 10.5 }] }],
    ["a negative amount", { rows: [{ ...report.rows[0], total: -1 }] }],
    ["a missing average ticket", { rows: [{ ...report.rows[0], average_ticket: undefined }] }],
    ["an average ticket with decimals", { rows: [{ ...report.rows[0], average_ticket: 0.5 }] }],
    ["a negative cashier count", { totals: { ...report.totals, cashiers: -1 } }],
    ["a total that is not a number", { totals: { ...report.totals, total: "10500" } }],
    ["a missing total average ticket", { totals: { cashiers: 2, sales_count: 4, total: 10_500 } }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(salesByCashierSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
