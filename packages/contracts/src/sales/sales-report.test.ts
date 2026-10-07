import { describe, expect, it } from "vitest";
import {
  reportRegisterListSchema,
  salesReportQuerySchema,
  salesReportSchema,
} from "./sales-report.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("salesReportQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(salesReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a range of calendar days and a register", () => {
    const query = { from: "2026-10-01", to: "2026-10-06", register_id: REGISTER_ID };

    expect(salesReportQuerySchema.parse(query)).toEqual(query);
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a start without an end", { from: "2026-10-06" }],
    ["an end without a start", { to: "2026-10-06" }],
    ["a bound that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
    ["an empty bound", { from: "", to: "" }],
    ["a register that is not an id", { register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(salesReportQuerySchema.safeParse(query).success).toBe(false);
  });
});

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

describe("reportRegisterListSchema", () => {
  it("accepts the registers a report can be filtered by", () => {
    const list = { registers: [{ id: REGISTER_ID, name: "Caja 1" }] };

    expect(reportRegisterListSchema.parse(list)).toEqual(list);
  });

  it("accepts a branch without registers", () => {
    expect(reportRegisterListSchema.parse({ registers: [] })).toEqual({ registers: [] });
  });

  it("refuses a register without a name", () => {
    expect(reportRegisterListSchema.safeParse({ registers: [{ id: REGISTER_ID }] }).success).toBe(
      false,
    );
  });
});
