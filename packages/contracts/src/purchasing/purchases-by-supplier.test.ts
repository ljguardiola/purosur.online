import { describe, expect, it } from "vitest";
import {
  purchasesBySupplierQuerySchema,
  purchasesBySupplierSchema,
} from "./purchases-by-supplier.js";

const SUPPLIER_ID = "2c7e9a14-5b3d-4f08-9e61-8a1d4c6b0f35";

describe("purchasesBySupplierQuerySchema", () => {
  it("accepts no period", () => {
    expect(purchasesBySupplierQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period, also of a single day", () => {
    expect(purchasesBySupplierQuerySchema.parse({ from: "2026-09-01", to: "2026-10-06" })).toEqual({
      from: "2026-09-01",
      to: "2026-10-06",
    });
    expect(
      purchasesBySupplierQuerySchema.safeParse({ from: "2026-10-06", to: "2026-10-06" }).success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-09-01" }],
    ["only the last day", { to: "2026-10-06" }],
    ["a period that ends before it starts", { from: "2026-10-06", to: "2026-09-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
  ])("refuses %s", (_name, query) => {
    expect(purchasesBySupplierQuerySchema.safeParse(query).success).toBe(false);
  });

  it("drops a register, which purchases do not carry", () => {
    expect(
      purchasesBySupplierQuerySchema.parse({
        from: "2026-09-01",
        to: "2026-10-06",
        register_id: "9a3f6c52-1d84-4b07-8c1e-5e7a2b9d4f10",
      }),
    ).toEqual({ from: "2026-09-01", to: "2026-10-06" });
  });
});

describe("purchasesBySupplierSchema", () => {
  const month = { month: "2026-10", purchases: 2, amount: 2_250 };
  const supplier = {
    supplier_id: SUPPLIER_ID,
    name: "Distribuidora Norte",
    months: [month],
    purchases: 2,
    amount: 2_250,
  };
  const report = {
    range: { from: "2026-10-01", to: "2026-10-06" },
    suppliers: [supplier],
    totals: { suppliers: 1, purchases: 2, amount: 2_250 },
  };

  it("accepts the suppliers of a range with their months and totals", () => {
    expect(purchasesBySupplierSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without purchases", () => {
    const empty = {
      range: report.range,
      suppliers: [],
      totals: { suppliers: 0, purchases: 0, amount: 0 },
    };

    expect(purchasesBySupplierSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a month that cost nothing", () => {
    const free = { ...report, suppliers: [{ ...supplier, months: [{ ...month, amount: 0 }] }] };

    expect(purchasesBySupplierSchema.safeParse(free).success).toBe(true);
  });

  const withTotals = (change: object) => ({ totals: { ...report.totals, ...change } });
  const withSupplier = (change: object) => ({ suppliers: [{ ...supplier, ...change }] });
  const withMonth = (change: object) => withSupplier({ months: [{ ...month, ...change }] });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a total without suppliers", { totals: { purchases: 2, amount: 2_250 } }],
    ["a total without purchases", { totals: { suppliers: 1, amount: 2_250 } }],
    ["a total without amount", { totals: { suppliers: 1, purchases: 2 } }],
    ["a negative count of suppliers", withTotals({ suppliers: -1 })],
    ["a count of suppliers with decimals", withTotals({ suppliers: 1.5 })],
    ["a negative count of purchases", withTotals({ purchases: -1 })],
    ["a count of purchases with decimals", withTotals({ purchases: 1.5 })],
    ["a negative total amount", withTotals({ amount: -1 })],
    ["a total amount with decimals", withTotals({ amount: 1.5 })],
    ["a supplier that is not a record id", withSupplier({ supplier_id: "prov-1" })],
    ["a supplier without a name", withSupplier({ name: undefined })],
    ["a supplier without purchases", withSupplier({ purchases: 0 })],
    ["a supplier with decimals in its purchases", withSupplier({ purchases: 1.5 })],
    ["a supplier with a negative amount", withSupplier({ amount: -1 })],
    ["a supplier with decimals in its amount", withSupplier({ amount: 1.5 })],
    ["a supplier without months", withSupplier({ months: undefined })],
    ["a month that is not a month", withMonth({ month: "octubre" })],
    ["a month without purchases", withMonth({ purchases: 0 })],
    ["a month with decimals in its purchases", withMonth({ purchases: 1.5 })],
    ["a month with a negative amount", withMonth({ amount: -1 })],
    ["a month with decimals in its amount", withMonth({ amount: 1.5 })],
  ])("refuses %s", (_name, change) => {
    expect(purchasesBySupplierSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
