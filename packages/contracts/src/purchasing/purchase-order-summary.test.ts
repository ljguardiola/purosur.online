import { PURCHASE_ORDER_STATES } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  purchaseOrderListQuerySchema,
  purchaseOrderListSchema,
  purchaseOrderSummarySchema,
} from "./purchase-order-summary.js";

const summary = {
  id: "order-1",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  state: "DRAFT",
  createdAt: "2026-03-10T15:00:00.000Z",
  lineCount: 2,
  expectedTotalCents: 4_550,
  hasUnpricedLine: true,
};

describe("purchaseOrderSummarySchema", () => {
  it("accepts an order with its line count, expected total and whether a line has no price", () => {
    expect(purchaseOrderSummarySchema.safeParse(summary).data).toEqual(summary);
  });

  it.each(PURCHASE_ORDER_STATES)("accepts the state %s", (state) => {
    expect(purchaseOrderSummarySchema.safeParse({ ...summary, state }).success).toBe(true);
  });

  it("rejects an unknown state, a date that is not an instant and a fractional total", () => {
    expect(purchaseOrderSummarySchema.safeParse({ ...summary, state: "SENT" }).success).toBe(false);
    expect(
      purchaseOrderSummarySchema.safeParse({ ...summary, createdAt: "yesterday" }).success,
    ).toBe(false);
    expect(
      purchaseOrderSummarySchema.safeParse({ ...summary, expectedTotalCents: 1.5 }).success,
    ).toBe(false);
  });
});

describe("purchaseOrderListSchema", () => {
  it("accepts a list of orders", () => {
    expect(purchaseOrderListSchema.safeParse([summary, summary]).success).toBe(true);
    expect(purchaseOrderListSchema.safeParse([]).success).toBe(true);
  });
});

describe("purchaseOrderListQuerySchema", () => {
  it("accepts no state or one state", () => {
    expect(purchaseOrderListQuerySchema.parse({})).toEqual({});
    expect(purchaseOrderListQuerySchema.parse({ state: "CANCELLED" })).toEqual({
      state: "CANCELLED",
    });
  });

  it("rejects a state that does not exist", () => {
    expect(purchaseOrderListQuerySchema.safeParse({ state: "SENT" }).success).toBe(false);
    expect(purchaseOrderListQuerySchema.safeParse({ state: "" }).success).toBe(false);
  });
});
