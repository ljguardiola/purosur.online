import { describe, expect, it } from "vitest";
import { freightByPeriodQuerySchema, freightByPeriodSchema } from "./freight-by-period.js";

describe("freightByPeriodQuerySchema", () => {
  it("accepts no period", () => {
    expect(freightByPeriodQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period, also of a single day", () => {
    expect(freightByPeriodQuerySchema.parse({ from: "2026-09-01", to: "2026-10-06" })).toEqual({
      from: "2026-09-01",
      to: "2026-10-06",
    });
    expect(
      freightByPeriodQuerySchema.safeParse({ from: "2026-10-06", to: "2026-10-06" }).success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-09-01" }],
    ["only the last day", { to: "2026-10-06" }],
    ["a period that ends before it starts", { from: "2026-10-06", to: "2026-09-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
  ])("refuses %s", (_name, query) => {
    expect(freightByPeriodQuerySchema.safeParse(query).success).toBe(false);
  });

  it("drops a register, which freight does not carry", () => {
    expect(
      freightByPeriodQuerySchema.parse({
        from: "2026-09-01",
        to: "2026-10-06",
        register_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      }),
    ).toEqual({ from: "2026-09-01", to: "2026-10-06" });
  });
});

describe("freightByPeriodSchema", () => {
  const month = { month: "2026-10", freights: 2, amount: 12_550 };
  const report = {
    range: { from: "2026-10-01", to: "2026-10-06" },
    months: [month],
    totals: { freights: 2, amount: 12_550 },
  };

  it("accepts the months of a range with their totals", () => {
    expect(freightByPeriodSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without freight", () => {
    const empty = { range: report.range, months: [], totals: { freights: 0, amount: 0 } };

    expect(freightByPeriodSchema.parse(empty)).toEqual(empty);
  });

  it.each(["2026-01", "2026-12", "1999-09"])("accepts the month %s", (name) => {
    const body = { ...report, months: [{ ...month, month: name }] };

    expect(freightByPeriodSchema.safeParse(body).success).toBe(true);
  });

  const withTotals = (change: object) => ({ totals: { ...report.totals, ...change } });
  const withMonth = (change: object) => ({ months: [{ ...month, ...change }] });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a total without freights", { totals: { amount: 12_550 } }],
    ["a total without amount", { totals: { freights: 2 } }],
    ["a negative count of freights", withTotals({ freights: -1 })],
    ["a count of freights with decimals", withTotals({ freights: 1.5 })],
    ["a negative total amount", withTotals({ amount: -1 })],
    ["a total amount with decimals", withTotals({ amount: 1.5 })],
    ["a month that is not a month", withMonth({ month: "octubre" })],
    ["a month with a day", withMonth({ month: "2026-10-06" })],
    ["a month number of zero", withMonth({ month: "2026-00" })],
    ["a month number above twelve", withMonth({ month: "2026-13" })],
    ["a month with a two digit year", withMonth({ month: "26-10" })],
    ["a month with trailing text", withMonth({ month: "2026-10x" })],
    ["a month with leading text", withMonth({ month: "x2026-10" })],
    ["a month without freights", withMonth({ freights: 0 })],
    ["a month with decimals in its freights", withMonth({ freights: 1.5 })],
    ["a month without amount", withMonth({ amount: 0 })],
    ["a month with a negative amount", withMonth({ amount: -1 })],
    ["a month with decimals in its amount", withMonth({ amount: 1.5 })],
    ["no months", { months: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(freightByPeriodSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
