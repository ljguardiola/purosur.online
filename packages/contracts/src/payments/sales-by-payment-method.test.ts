import { describe, expect, it } from "vitest";
import { salesByPaymentMethodSchema } from "./sales-by-payment-method.js";

const report = {
  range: { from: "2026-10-05", to: "2026-10-06" },
  methods: [
    { method: "CASH", sales_count: 2, amount: 9_000 },
    { method: "QR", sales_count: 1, amount: 6_000 },
  ],
  totals: { sales_count: 3, total: 15_000, average_ticket: 5_000 },
};

describe("salesByPaymentMethodSchema", () => {
  it("accepts the methods of a range with their totals", () => {
    expect(salesByPaymentMethodSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without sales, which has no average ticket", () => {
    const empty = {
      ...report,
      methods: [],
      totals: { sales_count: 0, total: 0, average_ticket: null },
    };

    expect(salesByPaymentMethodSchema.parse(empty)).toEqual(empty);
  });

  it.each(["CASH", "TRANSFER", "QR", "POINT"])("accepts the payment method %s", (method) => {
    const body = { ...report, methods: [{ method, sales_count: 1, amount: 1 }] };

    expect(salesByPaymentMethodSchema.safeParse(body).success).toBe(true);
  });

  it.each([
    [
      "a method that does not exist",
      { methods: [{ method: "CHEQUE", sales_count: 1, amount: 1 }] },
    ],
    ["a negative count", { methods: [{ method: "CASH", sales_count: -1, amount: 1 }] }],
    ["an amount with decimals", { methods: [{ method: "CASH", sales_count: 1, amount: 1.5 }] }],
    ["a negative amount", { methods: [{ method: "CASH", sales_count: 1, amount: -1 }] }],
    [
      "a total that is not an amount",
      { totals: { sales_count: 3, total: "15000", average_ticket: 1 } },
    ],
    [
      "an average ticket with decimals",
      { totals: { sales_count: 3, total: 15_000, average_ticket: 0.5 } },
    ],
    ["a missing average ticket", { totals: { sales_count: 3, total: 15_000 } }],
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
  ])("refuses %s", (_name, change) => {
    expect(salesByPaymentMethodSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
