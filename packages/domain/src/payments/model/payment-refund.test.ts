import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isRefundDiscarded,
  isRefundOriginDiscardable,
  isRefundPending,
  LATE_PAYMENT_REFUND_ORIGIN,
  type LatePaymentRefund,
  latePaymentRefund,
  latePaymentRefundOfUnrecordedOrder,
  methodsCoveringRefundedSale,
  PLANNED_REFUND_STATES,
  type PlannedRefund,
  type PlannedRefundState,
  plannedRefundState,
  plannedRefunds,
  REFUND_ORIGINS,
  REFUND_STATES,
  REFUND_TASK_ORIGINS,
  refundAlertKind,
  refundsSettleApprovedPayments,
  SALE_CANCELLED_REFUND_ORIGIN,
  SALE_VOIDED_REFUND_ORIGIN,
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

  it("leaves an approved Mercado Pago QR payment pending until a person confirms its refund", () => {
    expect(
      plannedRefunds([
        { id: "pay-3", method: "QR", provider: "MERCADOPAGO_QR", amount: 900, state: "APPROVED" },
      ]),
    ).toEqual([
      {
        paymentId: "pay-3",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 900,
        state: "PENDING",
      },
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

describe("plannedRefundState", () => {
  it("gives cash back on the spot", () => {
    expect(plannedRefundState("CASH")).toBe("APPROVED");
  });

  it.each(["TRANSFER", "STANDALONE_TERMINAL", "QR", "POINT"] as const)(
    "leaves a %s refund pending until a person carries it out",
    (method) => {
      expect(plannedRefundState(method)).toBe("PENDING");
    },
  );
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

describe("REFUND_STATES", () => {
  it("lists a refund as done, pending or discarded", () => {
    expect(REFUND_STATES).toEqual(["APPROVED", "PENDING", "DISCARDED"]);
  });
});

describe("PLANNED_REFUND_STATES", () => {
  it("lists a planned refund as done or pending, never discarded", () => {
    expect(PLANNED_REFUND_STATES).toEqual(["APPROVED", "PENDING"]);
    expectTypeOf<(typeof PLANNED_REFUND_STATES)[number]>().toEqualTypeOf<PlannedRefundState>();
  });
});

describe("PlannedRefundState", () => {
  it("is the state of a planned refund, which is done or pending and never discarded", () => {
    expectTypeOf<PlannedRefund["state"]>().toEqualTypeOf<PlannedRefundState>();
    expectTypeOf<"APPROVED">().toExtend<PlannedRefundState>();
    expectTypeOf<"PENDING">().toExtend<PlannedRefundState>();
    expectTypeOf<"DISCARDED">().not.toExtend<PlannedRefundState>();
  });
});

describe("REFUND_ORIGINS", () => {
  it("tells a refund of a cancelled sale from one of a payment that arrived late", () => {
    expect(REFUND_ORIGINS).toEqual(["sale_cancelled", "late_payment", "sale_voided"]);
    expect(SALE_CANCELLED_REFUND_ORIGIN).toBe("sale_cancelled");
    expect(SALE_VOIDED_REFUND_ORIGIN).toBe("sale_voided");
    expect(LATE_PAYMENT_REFUND_ORIGIN).toBe("late_payment");
  });
});

describe("isRefundDiscarded", () => {
  it("is true only for a refund a person set aside", () => {
    expect(isRefundDiscarded("DISCARDED")).toBe(true);
    expect(isRefundPending("DISCARDED")).toBe(false);
  });

  it.each(["APPROVED", "PENDING", "discarded", ""])("is false for the state %j", (state) => {
    expect(isRefundDiscarded(state)).toBe(false);
  });
});

describe("isRefundOriginDiscardable", () => {
  it("is true for the refund of a payment that arrived late", () => {
    expect(isRefundOriginDiscardable("late_payment")).toBe(true);
  });

  it.each(["sale_cancelled", "sale_voided", "", "other"])(
    "is false for the origin %j",
    (origin) => {
      expect(isRefundOriginDiscardable(origin)).toBe(false);
    },
  );
});

describe("refundAlertKind", () => {
  it("is the late-payment refund alert for a payment that arrived late", () => {
    expect(refundAlertKind(LATE_PAYMENT_REFUND_ORIGIN)).toBe("late_payment_refund");
  });

  it("is the refund task alert for a cancelled sale", () => {
    expect(refundAlertKind(SALE_CANCELLED_REFUND_ORIGIN)).toBe("refund_task");
  });

  it("is the refund task alert for a voided sale", () => {
    expect(refundAlertKind(SALE_VOIDED_REFUND_ORIGIN)).toBe("refund_task");
  });
});

describe("REFUND_TASK_ORIGINS", () => {
  it("lists every origin whose refund gets the refund task alert, leaving out a payment that arrived late", () => {
    expect(REFUND_TASK_ORIGINS).toEqual([SALE_CANCELLED_REFUND_ORIGIN, SALE_VOIDED_REFUND_ORIGIN]);
  });
});

describe("latePaymentRefund", () => {
  it("gives the payment back by the channel it came in, for its full amount, until a person carries it out", () => {
    expect(
      latePaymentRefund({
        id: "pay-3",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 2500,
      }),
    ).toEqual({
      paymentId: "pay-3",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: 2500,
      state: "PENDING",
      origin: "late_payment",
      providerOrderId: null,
    });
  });

  it("is never settled in cash", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (amount) => {
        const refund = latePaymentRefund({
          id: "pay-3",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount,
        });

        expect(refund.method).not.toBe("CASH");
        expect(refund.state).toBe("PENDING");
        expect(refund.amount).toBe(amount);
      }),
    );
  });
});

describe("methodsCoveringRefundedSale", () => {
  it("names each method an approved payment of a late payment's sale used, once, in the catalog's order", () => {
    expect(
      methodsCoveringRefundedSale(LATE_PAYMENT_REFUND_ORIGIN, [
        { method: "TRANSFER", state: "APPROVED" },
        { method: "CASH", state: "APPROVED" },
        { method: "TRANSFER", state: "APPROVED" },
      ]),
    ).toEqual(["CASH", "TRANSFER"]);
  });

  it("leaves out the methods of payments that were not approved", () => {
    expect(
      methodsCoveringRefundedSale(LATE_PAYMENT_REFUND_ORIGIN, [
        { method: "QR", state: "DECLINED" },
        { method: "CASH", state: "APPROVED" },
        { method: "TRANSFER", state: "PENDING" },
      ]),
    ).toEqual(["CASH"]);
  });

  it("names none while the late payment's sale has no payment", () => {
    expect(methodsCoveringRefundedSale(LATE_PAYMENT_REFUND_ORIGIN, [])).toEqual([]);
  });

  it("names none for the refund of a voided sale, whatever paid it", () => {
    expect(
      methodsCoveringRefundedSale(SALE_VOIDED_REFUND_ORIGIN, [
        { method: "CASH", state: "APPROVED" },
        { method: "TRANSFER", state: "APPROVED" },
      ]),
    ).toEqual([]);
  });

  it("names none for the refund of a cancelled sale, whatever paid it", () => {
    expect(
      methodsCoveringRefundedSale(SALE_CANCELLED_REFUND_ORIGIN, [
        { method: "CASH", state: "APPROVED" },
        { method: "TRANSFER", state: "APPROVED" },
      ]),
    ).toEqual([]);
  });
});

describe("LatePaymentRefund", () => {
  it("names the Mercado Pago method the late payment was made with", () => {
    expectTypeOf<LatePaymentRefund["method"]>().toEqualTypeOf<"QR" | "POINT">();
  });

  it("is given back for a Point payment as well as for a QR one", () => {
    expectTypeOf(latePaymentRefund).parameter(0).toExtend<{ method: "QR" | "POINT" }>();
    expect(
      latePaymentRefund({
        id: "pay-4",
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        amount: 900,
      }).method,
    ).toBe("POINT");
  });

  it("refuses a payment that is not a Mercado Pago one", () => {
    expectTypeOf<{
      id: string;
      method: "CASH";
      provider: string;
      amount: number;
    }>().not.toExtend<Parameters<typeof latePaymentRefund>[0]>();
    expectTypeOf<{
      id: string;
      method: "CASH";
      provider: string;
      amount: number;
    }>().not.toExtend<Parameters<typeof latePaymentRefundOfUnrecordedOrder>[0]>();
  });
});

describe("latePaymentRefundOfUnrecordedOrder", () => {
  it("gives back what the order was paid, naming the order the payment did not record", () => {
    expect(
      latePaymentRefundOfUnrecordedOrder(
        { id: "pay-3", method: "QR", provider: "MERCADOPAGO_QR", amount: 2500 },
        "order-2",
        2300,
      ),
    ).toEqual({
      paymentId: "pay-3",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: 2300,
      state: "PENDING",
      origin: "late_payment",
      providerOrderId: "order-2",
    });
  });
});
