import { describe, expect, it } from "vitest";
import { cashRoundingSchema } from "./cash-rounding.js";

describe("cashRoundingSchema", () => {
  const report = {
    range: { from: "2026-10-05", to: "2026-10-06" },
    rows: [
      {
        day: "2026-10-05",
        register_id: "5f1c0a4e-6a8e-4c5b-9a3e-0e5e8f1d2a11",
        register_name: "Caja 1",
        rounded: 150,
        rounded_sale_count: 2,
      },
    ],
    totals: { rounded: 150, rounded_sale_count: 2 },
  };

  it("accepts the rounding of each day and register with its totals", () => {
    expect(cashRoundingSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without rounding", () => {
    const empty = { ...report, rows: [], totals: { rounded: 0, rounded_sale_count: 0 } };

    expect(cashRoundingSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["a day that is not a calendar day", { day: "2026-02-30" }],
    ["a negative count", { rounded_sale_count: -1 }],
    ["an amount with decimals", { rounded: 10.5 }],
    ["a register without a name", { register_name: undefined }],
    ["a register without an id", { register_id: "" }],
  ])("refuses a row with %s", (_name, change) => {
    const [row] = report.rows;

    expect(cashRoundingSchema.safeParse({ ...report, rows: [{ ...row, ...change }] }).success).toBe(
      false,
    );
  });

  it.each([
    ["a total that is not an amount", { totals: { rounded: "150", rounded_sale_count: 2 } }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(cashRoundingSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
