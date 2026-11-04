import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  pendingPurchaseOrdersQuerySchema,
  pendingPurchaseOrdersSchema,
} from "./pending-purchase-orders.js";

const SUPPLIER_ID = "2c7e9a14-5b3d-4f08-9e61-8a1d4c6b0f35";
const ORDER_ID = "7d1f3b52-9a40-4c68-b2e7-0f5a8c3d6e19";

describe("pendingPurchaseOrdersQuerySchema", () => {
  it("accepts no period", () => {
    expect(pendingPurchaseOrdersQuerySchema.parse({})).toEqual({});
  });

  it("accepts a period, also of a single day", () => {
    expect(
      pendingPurchaseOrdersQuerySchema.parse({ from: "2026-09-01", to: "2026-10-06" }),
    ).toEqual({ from: "2026-09-01", to: "2026-10-06" });
    expect(
      pendingPurchaseOrdersQuerySchema.safeParse({ from: "2026-10-06", to: "2026-10-06" }).success,
    ).toBe(true);
  });

  it.each([
    ["only the first day", { from: "2026-09-01" }],
    ["only the last day", { to: "2026-10-06" }],
    ["a period that ends before it starts", { from: "2026-10-06", to: "2026-09-01" }],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
  ])("refuses %s", (_name, query) => {
    expect(pendingPurchaseOrdersQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("pendingPurchaseOrdersSchema", () => {
  const order = {
    id: ORDER_ID,
    supplier: { id: SUPPLIER_ID, name: "Distribuidora Norte" },
    state: "SENT",
    sent_at: "2026-10-01T15:00:00.000Z",
    line_count: 2,
    expected_total_cents: 3_250,
    has_unpriced_line: false,
  };
  const report = {
    range: { from: "2026-09-07", to: "2026-10-06" },
    orders: [order],
    totals: { orders: 1, suppliers: 1, expected_total_cents: 3_250, has_unpriced_line: false },
  };

  it("accepts the pending orders of a range with their totals", () => {
    expect(pendingPurchaseOrdersSchema.parse(report)).toEqual(report);
  });

  it("accepts a range without pending orders", () => {
    const empty = {
      range: report.range,
      orders: [],
      totals: { orders: 0, suppliers: 0, expected_total_cents: 0, has_unpriced_line: false },
    };

    expect(pendingPurchaseOrdersSchema.parse(empty)).toEqual(empty);
  });

  it.each(["SENT", "PARTIALLY_RECEIVED"])("accepts an order in the state %s", (state) => {
    expect(
      pendingPurchaseOrdersSchema.safeParse({ ...report, orders: [{ ...order, state }] }).success,
    ).toBe(true);
  });

  const withTotals = (change: object) => ({ totals: { ...report.totals, ...change } });
  const withOrder = (change: object) => ({ orders: [{ ...order, ...change }] });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["a total without orders", withTotals({ orders: undefined })],
    ["a total without suppliers", withTotals({ suppliers: undefined })],
    ["a total without expected total", withTotals({ expected_total_cents: undefined })],
    ["a total without the unpriced flag", withTotals({ has_unpriced_line: undefined })],
    ["a negative count of orders", withTotals({ orders: -1 })],
    ["a count of orders with decimals", withTotals({ orders: 1.5 })],
    ["a negative count of suppliers", withTotals({ suppliers: -1 })],
    ["a count of suppliers with decimals", withTotals({ suppliers: 1.5 })],
    ["a negative expected total", withTotals({ expected_total_cents: -1 })],
    ["an expected total with decimals", withTotals({ expected_total_cents: 1.5 })],
    ["an order that is not a record id", withOrder({ id: "oc-1" })],
    ["an order without a supplier", withOrder({ supplier: undefined })],
    [
      "a supplier that is not a record id",
      withOrder({ supplier: { id: "prov-1", name: "Distribuidora Norte" } }),
    ],
    ["a supplier without a name", withOrder({ supplier: { id: SUPPLIER_ID } })],
    ["a draft order", withOrder({ state: "DRAFT" })],
    ["a received order", withOrder({ state: "RECEIVED" })],
    ["a cancelled order", withOrder({ state: "CANCELLED" })],
    ["an order sent at a moment without a time", withOrder({ sent_at: "2026-10-01" })],
    ["an order without a send date", withOrder({ sent_at: undefined })],
    ["a negative line count", withOrder({ line_count: -1 })],
    ["a line count with decimals", withOrder({ line_count: 1.5 })],
    ["a negative expected total on an order", withOrder({ expected_total_cents: -1 })],
    ["an expected total with decimals on an order", withOrder({ expected_total_cents: 1.5 })],
    ["an order without the unpriced flag", withOrder({ has_unpriced_line: undefined })],
  ])("refuses %s", (_name, change) => {
    expect(pendingPurchaseOrdersSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});

describe("pendingPurchaseOrdersSchema, declared time zone", () => {
  it("declares the zone the send instant is shown in", () => {
    expect(pendingPurchaseOrdersSchema.shape.orders.element.shape.sent_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});
