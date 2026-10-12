import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  discardedRefundSchema,
  markedRefundDoneSchema,
  pendingRefundsSchema,
} from "./pending-refunds.js";

const REFUND_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const SALE_ID = "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";
const REGISTER_ID = "0c5d8e2f-1a77-4b0d-8c1e-7f3a4e589a61";

const refund: Record<string, unknown> = {
  id: REFUND_ID,
  sale_id: SALE_ID,
  register_id: REGISTER_ID,
  register_name: "Caja 1",
  method: "TRANSFER",
  origin: "sale_cancelled",
  discardable: false,
  amount: 2000,
  occurred_at: "2026-10-07T15:30:00.000Z",
  seconds_pending: 3600,
  sale_occurred_at: "2026-10-07T15:30:00.000Z",
  covered_by: [],
  provider_order_id: null,
  cancelled_by: "u1",
  cancelled_by_name: "Lucia",
};

describe("pendingRefundsSchema", () => {
  it("accepts the refunds waiting for a person to carry them out", () => {
    const list = { refunds: [refund, { ...refund, id: SALE_ID }] };

    expect(pendingRefundsSchema.parse(list)).toEqual(list);
  });

  it("accepts a branch without pending refunds", () => {
    expect(pendingRefundsSchema.parse({ refunds: [] })).toEqual({ refunds: [] });
  });

  it("accepts the refund of a late payment, which no one cancelled, as one that can be discarded", () => {
    const list = {
      refunds: [
        {
          ...refund,
          origin: "late_payment",
          discardable: true,
          method: "QR",
          cancelled_by: null,
          cancelled_by_name: null,
        },
      ],
    };

    expect(pendingRefundsSchema.parse(list)).toEqual(list);
  });

  it("accepts the methods that already covered the sale of a late payment", () => {
    const list = {
      refunds: [{ ...refund, origin: "late_payment", covered_by: ["CASH", "TRANSFER"] }],
    };

    expect(pendingRefundsSchema.parse(list)).toEqual(list);
  });

  it("accepts the refund of a late payment that names the Mercado Pago order it is for", () => {
    const list = {
      refunds: [{ ...refund, origin: "late_payment", provider_order_id: "ORD01SECOND" }],
    };

    expect(pendingRefundsSchema.parse(list)).toEqual(list);
  });

  it("accepts a refund whose canceller is not a known person", () => {
    const list = { refunds: [{ ...refund, cancelled_by_name: null }] };

    expect(pendingRefundsSchema.parse(list)).toEqual(list);
  });

  it("refuses a refund missing any one of its fields", () => {
    const accepted = Object.keys(refund).filter((key) => {
      const { [key]: _removed, ...rest } = refund;
      return pendingRefundsSchema.safeParse({ refunds: [rest] }).success;
    });

    expect(accepted).toEqual([]);
  });

  it.each([
    ["an id that is not a record id", { id: "refund-1" }],
    ["a sale that is not a record id", { sale_id: "sale-1" }],
    ["a register that is not a record id", { register_id: "caja-1" }],
    ["a register name that is not text", { register_name: 1 }],
    ["a canceller name that is not text", { cancelled_by_name: 1 }],
    ["a canceller that is not text", { cancelled_by: 1 }],
    ["an origin no refund has", { origin: "manual" }],
    ["a discardable flag that is not a boolean", { discardable: "yes" }],
    ["a method no payment has", { method: "CARD" }],
    ["a fractional amount", { amount: 10.5 }],
    ["a negative amount", { amount: -1 }],
    ["a date that is not ISO", { occurred_at: "ayer" }],
    ["a sale date that is not ISO", { sale_occurred_at: "ayer" }],
    ["a method that covered the sale and no payment has", { covered_by: ["CARD"] }],
    ["covering methods that are not a list", { covered_by: "CASH" }],
    ["an order that is not text", { provider_order_id: 1 }],
    ["an empty order", { provider_order_id: "" }],
    ["a fractional time pending", { seconds_pending: 1.5 }],
    ["a negative time pending", { seconds_pending: -1 }],
  ])("refuses a refund with %s", (_case, change) => {
    expect(pendingRefundsSchema.safeParse({ refunds: [{ ...refund, ...change }] }).success).toBe(
      false,
    );
  });
});

describe("pendingRefundsSchema, declared time zone", () => {
  it("declares the same zone for the moment of the sale", () => {
    expect(pendingRefundsSchema.shape.refunds.element.shape.sale_occurred_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it("declares the zone the moment of a refund is shown in", () => {
    expect(pendingRefundsSchema.shape.refunds.element.shape.occurred_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});

describe("markedRefundDoneSchema", () => {
  const done = { refund_id: REFUND_ID, done_at: "2026-10-08T14:00:00.000Z" };

  it("accepts the refund marked as done and when", () => {
    expect(markedRefundDoneSchema.parse(done)).toEqual(done);
  });

  it.each([
    ["without the refund", { done_at: done.done_at }],
    ["without the moment", { refund_id: REFUND_ID }],
    ["with a refund that is not a record id", { ...done, refund_id: "refund-1" }],
    ["with a moment that is not ISO", { ...done, done_at: "hoy" }],
  ])("refuses %s", (_case, body) => {
    expect(markedRefundDoneSchema.safeParse(body).success).toBe(false);
  });
});

describe("discardedRefundSchema", () => {
  const discarded = { refund_id: REFUND_ID, discarded_at: "2026-10-08T14:00:00.000Z" };

  it("accepts the refund discarded and when", () => {
    expect(discardedRefundSchema.parse(discarded)).toEqual(discarded);
  });

  it.each([
    ["without the refund", { discarded_at: discarded.discarded_at }],
    ["without the moment", { refund_id: REFUND_ID }],
    ["with a refund that is not a record id", { ...discarded, refund_id: "refund-1" }],
    ["with a moment that is not ISO", { ...discarded, discarded_at: "hoy" }],
  ])("refuses %s", (_case, body) => {
    expect(discardedRefundSchema.safeParse(body).success).toBe(false);
  });
});
