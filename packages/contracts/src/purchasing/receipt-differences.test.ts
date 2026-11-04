import { describe, expect, it } from "vitest";
import { receiptDifferencesQuerySchema, receiptDifferencesSchema } from "./receipt-differences.js";

const SUPPLIER_ID = "2c7e9a14-5b3d-4f08-9e61-8a1d4c6b0f35";
const RECEIPT_ID = "5b0e8d27-3c91-4a64-b7f2-9d1c6e4a8035";
const ORDER_ID = "7d1f3b52-9a40-4c68-b2e7-0f5a8c3d6e19";

describe("receiptDifferencesQuerySchema", () => {
  it("accepts no period", () => {
    expect(receiptDifferencesQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period, also of a single day", () => {
    expect(receiptDifferencesQuerySchema.parse({ from: "2026-09-01", to: "2026-10-06" })).toEqual({
      from: "2026-09-01",
      to: "2026-10-06",
    });
    expect(
      receiptDifferencesQuerySchema.safeParse({ from: "2026-10-06", to: "2026-10-06" }).success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-09-01" }],
    ["only the last day", { to: "2026-10-06" }],
    ["a period that ends before it starts", { from: "2026-10-06", to: "2026-09-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
  ])("refuses %s", (_name, query) => {
    expect(receiptDifferencesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("receiptDifferencesSchema", () => {
  const line = {
    receipt_id: RECEIPT_ID,
    order_id: ORDER_ID,
    received_on: "2026-10-05",
    product: {
      id: "p-1",
      name: "Yerba mate",
      brandName: "Piragüé",
      netContent: { quantity: 500, unit: "G" },
      saleUnit: "UNIT",
    },
    received_quantity: 6_000,
    missing_quantity: 4_000,
    price_difference_cents: -120,
  };
  const month = {
    month: "2026-10",
    short_lines: 1,
    price_difference_lines: 1,
    price_difference_cents: -120,
    lines: [line],
  };
  const supplier = {
    supplier_id: SUPPLIER_ID,
    name: "Distribuidora Norte",
    short_lines: 1,
    price_difference_lines: 1,
    price_difference_cents: -120,
    months: [month],
  };
  const report = {
    range: { from: "2026-09-07", to: "2026-10-06" },
    suppliers: [supplier],
    totals: {
      suppliers: 1,
      short_lines: 1,
      price_difference_lines: 1,
      price_difference_cents: -120,
    },
  };

  it("accepts the differences of a range with their totals", () => {
    expect(receiptDifferencesSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without differences", () => {
    const empty = {
      range: report.range,
      suppliers: [],
      totals: {
        suppliers: 0,
        short_lines: 0,
        price_difference_lines: 0,
        price_difference_cents: 0,
      },
    };

    expect(receiptDifferencesSchema.parse(empty)).toEqual(empty);
  });

  it("accepts a line without a price difference and a positive one", () => {
    const withLines = (lines: object[]) => ({
      ...report,
      suppliers: [{ ...supplier, months: [{ ...month, lines }] }],
    });

    expect(
      receiptDifferencesSchema.safeParse(
        withLines([
          { ...line, price_difference_cents: null },
          { ...line, price_difference_cents: 300 },
        ]),
      ).success,
    ).toBe(true);
  });

  const withTotals = (change: object) => ({ totals: { ...report.totals, ...change } });
  const withSupplier = (change: object) => ({ suppliers: [{ ...supplier, ...change }] });
  const withMonth = (change: object) => withSupplier({ months: [{ ...month, ...change }] });
  const withLine = (change: object) => withMonth({ lines: [{ ...line, ...change }] });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a total without suppliers", withTotals({ suppliers: undefined })],
    ["a negative count of suppliers", withTotals({ suppliers: -1 })],
    ["a total without short lines", withTotals({ short_lines: undefined })],
    ["a negative count of short lines", withTotals({ short_lines: -1 })],
    ["a count of short lines with decimals", withTotals({ short_lines: 1.5 })],
    ["a total without price difference lines", withTotals({ price_difference_lines: undefined })],
    ["a negative count of price difference lines", withTotals({ price_difference_lines: -1 })],
    ["a total without the net price difference", withTotals({ price_difference_cents: undefined })],
    ["a net price difference with decimals", withTotals({ price_difference_cents: 1.5 })],
    ["a supplier that is not a record id", withSupplier({ supplier_id: "prov-1" })],
    ["a supplier without a name", withSupplier({ name: undefined })],
    ["a negative count of short lines on a supplier", withSupplier({ short_lines: -1 })],
    [
      "a supplier without price difference lines",
      withSupplier({ price_difference_lines: undefined }),
    ],
    [
      "a supplier net price difference with decimals",
      withSupplier({ price_difference_cents: 0.5 }),
    ],
    ["a month that is not a report month", withMonth({ month: "2026-13" })],
    ["a negative count of short lines on a month", withMonth({ short_lines: -1 })],
    ["a month without price difference lines", withMonth({ price_difference_lines: undefined })],
    ["a month net price difference with decimals", withMonth({ price_difference_cents: 0.5 })],
    ["a line whose receipt is not a record id", withLine({ receipt_id: "r-1" })],
    ["a line whose order is not a record id", withLine({ order_id: "oc-1" })],
    [
      "a line received on a day that is not a calendar day",
      withLine({ received_on: "2026-02-30" }),
    ],
    ["a line without a product", withLine({ product: undefined })],
    ["a line with a negative received quantity", withLine({ received_quantity: -1 })],
    ["a line with a received quantity with decimals", withLine({ received_quantity: 1.5 })],
    ["a line with a negative missing quantity", withLine({ missing_quantity: -1 })],
    ["a line with a missing quantity with decimals", withLine({ missing_quantity: 1.5 })],
    ["a line with a price difference with decimals", withLine({ price_difference_cents: 1.5 })],
    ["a line without the price difference field", withLine({ price_difference_cents: undefined })],
  ])("refuses %s", (_name, change) => {
    expect(receiptDifferencesSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
