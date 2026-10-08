import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isRefundPending,
  plannedRefunds,
  refundsSettleApprovedPayments,
} from "./payment-refund.js";

const CASH = {
  id: "pay-1",
  method: "CASH",
  provider: "NONE",
  amount: 2700,
  state: "APPROVED",
} as const;
const TRANSFER = {
  id: "pay-2",
  method: "TRANSFER",
  provider: "NONE",
  amount: 1500,
  state: "APPROVED",
} as const;

describe("plannedRefunds", () => {
  it("gives back an approved cash payment on the spot", () => {
    expect(plannedRefunds([CASH])).toEqual([
      { paymentId: "pay-1", method: "CASH", provider: "NONE", amount: 2700, state: "APPROVED" },
    ]);
  });

  it("leaves an approved transfer pending until a person carries it out", () => {
    expect(plannedRefunds([TRANSFER])).toEqual([
      { paymentId: "pay-2", method: "TRANSFER", provider: "NONE", amount: 1500, state: "PENDING" },
    ]);
  });

  it("refunds each approved payment in full by its own method, in the order they were made", () => {
    expect(plannedRefunds([TRANSFER, CASH]).map(({ paymentId }) => paymentId)).toEqual([
      "pay-2",
      "pay-1",
    ]);
  });

  it("refunds nothing that was not approved", () => {
    expect(plannedRefunds([{ ...CASH, state: "REJECTED" }])).toEqual([]);
    expect(plannedRefunds([])).toEqual([]);
  });

  it("refunds exactly the amount paid by approved payments, for any payments", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            method: fc.constantFrom("CASH", "TRANSFER"),
            provider: fc.constant("NONE"),
            amount: fc.integer({ min: 1, max: 1_000_000 }),
            state: fc.constantFrom("APPROVED", "REJECTED"),
          }),
        ),
        (payments) => {
          const approved = payments.filter(({ state }) => state === "APPROVED");
          const refunds = plannedRefunds(payments);

          expect(refunds.map(({ paymentId, amount }) => [paymentId, amount])).toEqual(
            approved.map(({ id, amount }) => [id, amount]),
          );
          expect(refunds.map(({ method }) => method)).toEqual(approved.map(({ method }) => method));
        },
      ),
    );
  });
});

describe("refundsSettleApprovedPayments", () => {
  const payments = [CASH, TRANSFER];
  const settled = [
    { paymentId: "pay-1", method: "CASH", provider: "NONE", amount: 2700, state: "APPROVED" },
    { paymentId: "pay-2", method: "TRANSFER", provider: "NONE", amount: 1500, state: "PENDING" },
  ] as const;

  it("holds when each approved payment has one refund of its full amount settled by its method", () => {
    expect(refundsSettleApprovedPayments(payments, settled)).toBe(true);
  });

  it("holds whatever the order of the refunds", () => {
    expect(refundsSettleApprovedPayments(payments, [...settled].reverse())).toBe(true);
  });

  it("holds when a transfer refund was already marked as done", () => {
    const done = [settled[0], { ...settled[1], state: "APPROVED" }];

    expect(refundsSettleApprovedPayments(payments, done)).toBe(true);
  });

  it("does not hold when an approved payment has no refund", () => {
    expect(refundsSettleApprovedPayments(payments, [settled[0]])).toBe(false);
  });

  it("does not hold when a payment is refunded twice", () => {
    expect(refundsSettleApprovedPayments([CASH], [settled[0], settled[0]])).toBe(false);
  });

  it("does not hold when a refund belongs to no approved payment", () => {
    const stray = { ...settled[0], paymentId: "pay-9" };

    expect(refundsSettleApprovedPayments([CASH], [settled[0], stray])).toBe(false);
    expect(refundsSettleApprovedPayments([{ ...CASH, state: "REJECTED" }], [settled[0]])).toBe(
      false,
    );
  });

  it.each([
    ["a smaller amount", { amount: 2699 }],
    ["a larger amount", { amount: 2701 }],
    ["another method", { method: "TRANSFER" }],
    ["another provider", { provider: "TERMINAL" }],
    ["a cash refund still pending", { state: "PENDING" }],
  ] as const)("does not hold with a cash refund of %s", (_case, change) => {
    expect(refundsSettleApprovedPayments([CASH], [{ ...settled[0], ...change }])).toBe(false);
  });

  it("does not hold with a transfer refund already given back as if it were cash", () => {
    const refund = { ...settled[1], state: "REFUNDED" };

    expect(refundsSettleApprovedPayments([TRANSFER], [refund])).toBe(false);
  });

  it("holds for a sale without approved payments and without refunds", () => {
    expect(refundsSettleApprovedPayments([], [])).toBe(true);
  });
});

describe("isRefundPending", () => {
  it("is true for a refund waiting for a person to carry it out", () => {
    expect(isRefundPending("PENDING")).toBe(true);
  });

  it.each(["APPROVED", "pending", ""])("is false for the state %j", (state) => {
    expect(isRefundPending(state)).toBe(false);
  });
});
