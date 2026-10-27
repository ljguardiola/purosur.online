import { describe, expect, it } from "vitest";
import { expiringLotsReportQuerySchema, expiringLotsReportSchema } from "./expiring-lots-report.js";

describe("expiringLotsReportQuerySchema", () => {
  it("accepts no period", () => {
    expect(expiringLotsReportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period", () => {
    expect(expiringLotsReportQuerySchema.parse({ from: "2026-12-01", to: "2026-12-31" })).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("accepts a period of a single day", () => {
    expect(
      expiringLotsReportQuerySchema.safeParse({ from: "2026-12-01", to: "2026-12-01" }).success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-12-01" }],
    ["only the last day", { to: "2026-12-31" }],
    ["a period that ends before it starts", { from: "2026-12-31", to: "2026-12-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
    ["text instead of a day", { from: "pronto", to: "luego" }],
  ])("refuses %s", (_name, query) => {
    expect(expiringLotsReportQuerySchema.safeParse(query).success).toBe(false);
  });

  it("drops a register, which lots do not carry", () => {
    expect(
      expiringLotsReportQuerySchema.parse({
        from: "2026-12-01",
        to: "2026-12-31",
        register_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      }),
    ).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("expiringLotsReportSchema", () => {
  const lot = {
    id: "lot-1",
    lot_number: "L-77",
    expires_on: "2026-10-20",
    remaining: 4_000,
    value_cents: 20_000,
    expired: false,
    days_to_expiry: 7,
    product: {
      id: "product-1",
      name: "Queso cremoso",
      category_id: "category-1",
      category_name: "Lácteos",
      sale_unit: "KG",
    },
  };
  const report = {
    period: { from: "2026-10-13", to: "2026-11-12" },
    window_days: 30,
    lots: [lot],
    summary: { lot_count: 1, value_cents: 20_000, without_cost_count: 0 },
  };

  it("accepts the period, the window, the lots and the summary", () => {
    expect(expiringLotsReportSchema.parse(report)).toEqual(report);
  });

  it("accepts a lot without a lot number or a known value, and one already expired", () => {
    const unknown = {
      ...report,
      lots: [{ ...lot, lot_number: null, value_cents: null, expired: true, days_to_expiry: -3 }],
    };

    expect(expiringLotsReportSchema.parse(unknown)).toEqual(unknown);
  });

  it.each([
    ["an expiry that is not a calendar day", { expires_on: "pronto" }],
    ["a quantity with decimals", { remaining: 0.5 }],
    ["a value with decimals", { value_cents: 1.5 }],
    ["a count of days with decimals", { days_to_expiry: 1.5 }],
    ["a lot without the expired flag", { expired: undefined }],
    ["a sale unit that is not offered", { product: { ...lot.product, sale_unit: "LITRO" } }],
  ])("refuses %s", (_name, change) => {
    expect(
      expiringLotsReportSchema.safeParse({ ...report, lots: [{ ...lot, ...change }] }).success,
    ).toBe(false);
  });

  it.each([
    ["a period day that is not a calendar day", { period: { from: "ayer", to: "2026-11-12" } }],
    ["a window with decimals", { window_days: 1.5 }],
    ["a missing window", { window_days: undefined }],
    ["a lot count with decimals", { summary: { ...report.summary, lot_count: 1.5 } }],
    ["a summary value with decimals", { summary: { ...report.summary, value_cents: 1.5 } }],
    [
      "a missing without-cost count",
      { summary: { ...report.summary, without_cost_count: undefined } },
    ],
  ])("refuses %s", (_name, change) => {
    expect(expiringLotsReportSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
