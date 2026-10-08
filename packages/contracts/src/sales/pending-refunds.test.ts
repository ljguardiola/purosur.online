import { describe, expect, it } from "vitest";
import { markedRefundDoneSchema, pendingRefundsSchema } from "./pending-refunds.js";

const REFUND_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const SALE_ID = "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";
const REGISTER_ID = "0c5d8e2f-1a77-4b0d-8c1e-7f3a4e589a61";

const refund: Record<string, unknown> = {
  id: REFUND_ID,
  sale_id: SALE_ID,
  register_id: REGISTER_ID,
  register_name: "Caja 1",
  method: "TRANSFER",
  amount: 2000,
  occurred_at: "2026-10-07T15:30:00.000Z",
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
    ["a method no payment has", { method: "CARD" }],
    ["a fractional amount", { amount: 10.5 }],
    ["a negative amount", { amount: -1 }],
    ["a date that is not ISO", { occurred_at: "ayer" }],
  ])("refuses a refund with %s", (_case, change) => {
    expect(pendingRefundsSchema.safeParse({ refunds: [{ ...refund, ...change }] }).success).toBe(
      false,
    );
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
