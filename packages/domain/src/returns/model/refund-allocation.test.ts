import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type ReturnablePayment,
  refundAllocationRefusal,
  returnablePayments,
} from "./refund-allocation.js";

function payment(overrides: Partial<ReturnablePayment> = {}): ReturnablePayment {
  return {
    id: "pay-1",
    method: "CASH",
    provider: "NONE",
    amount: 5000,
    state: "APPROVED",
    refundedAmount: 0,
    cardType: null,
    ...overrides,
  };
}

describe("returnablePayments", () => {
  it("offers a cash payment with what it still has left to give back", () => {
    expect(returnablePayments([payment({ amount: 5000, refundedAmount: 1200 })])).toEqual([
      {
        paymentId: "pay-1",
        method: "CASH",
        amount: 5000,
        refundedAmount: 1200,
        cardType: null,
        remaining: 3800,
        eligible: true,
        ineligibleReason: null,
      },
    ]);
  });

  it.each(["TRANSFER", "QR", "POINT", "STANDALONE_TERMINAL"] as const)(
    "offers a %s payment with what it still has left to give back",
    (method) => {
      expect(
        returnablePayments([payment({ method, provider: "X", refundedAmount: 1000 })]),
      ).toEqual([
        {
          paymentId: "pay-1",
          method,
          amount: 5000,
          refundedAmount: 1000,
          cardType: null,
          remaining: 4000,
          eligible: true,
          ineligibleReason: null,
        },
      ]);
    },
  );

  it.each(["DEBIT", "CREDIT"] as const)(
    "carries the %s card type of a Point payment",
    (cardType) => {
      expect(
        returnablePayments([payment({ method: "POINT", provider: "X", cardType })])[0],
      ).toMatchObject({ method: "POINT", cardType });
    },
  );

  it("lists a cash payment with nothing left to give back as not chosen, saying so", () => {
    expect(returnablePayments([payment({ refundedAmount: 5000 })])).toEqual([
      {
        paymentId: "pay-1",
        method: "CASH",
        amount: 5000,
        refundedAmount: 5000,
        cardType: null,
        remaining: 0,
        eligible: false,
        ineligibleReason: "nothing_left",
      },
    ]);
  });

  it("lists a payment that is not cash with nothing left to give back as not chosen, saying so", () => {
    expect(
      returnablePayments([payment({ method: "TRANSFER", refundedAmount: 5000 })])[0],
    ).toMatchObject({ eligible: false, ineligibleReason: "nothing_left", remaining: 0 });
  });

  it("leaves out a payment that was never approved", () => {
    expect(returnablePayments([payment({ state: "PENDING" }), payment({ id: "pay-2" })])).toEqual([
      expect.objectContaining({ paymentId: "pay-2" }),
    ]);
  });

  it("keeps the order the payments came in", () => {
    expect(
      returnablePayments([payment({ id: "b" }), payment({ id: "a" })]).map(
        ({ paymentId }) => paymentId,
      ),
    ).toEqual(["b", "a"]);
  });

  it("never has a negative amount left", () => {
    expect(returnablePayments([payment({ amount: 100, refundedAmount: 150 })])[0]?.remaining).toBe(
      0,
    );
  });
});

describe("refundAllocationRefusal", () => {
  const PAYMENTS = [
    payment({ id: "cash-1", amount: 5000, refundedAmount: 1000 }),
    payment({ id: "cash-2", amount: 2000 }),
    payment({ id: "transfer-1", method: "TRANSFER", provider: "X", amount: 3000 }),
  ];

  it("accepts an imputation that adds up to the refundable total within what each payment has left", () => {
    expect(
      refundAllocationRefusal(
        PAYMENTS,
        [
          { paymentId: "cash-1", amount: 4000 },
          { paymentId: "cash-2", amount: 500 },
        ],
        4500,
      ),
    ).toBeNull();
  });

  it("accepts a refund of exactly what a payment has left", () => {
    expect(
      refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-1", amount: 4000 }], 4000),
    ).toBeNull();
  });

  it("accepts no imputation for a return that refunds nothing", () => {
    expect(refundAllocationRefusal(PAYMENTS, [], 0)).toBeNull();
  });

  it("refuses a payment the sale does not have", () => {
    expect(refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-9", amount: 100 }], 100)).toEqual({
      kind: "unknown_payment",
      paymentId: "cash-9",
    });
  });

  it("refuses a payment that was not approved as if the sale did not have it", () => {
    expect(
      refundAllocationRefusal(
        [payment({ id: "cash-1", state: "PENDING" })],
        [{ paymentId: "cash-1", amount: 100 }],
        100,
      ),
    ).toEqual({ kind: "unknown_payment", paymentId: "cash-1" });
  });

  it.each([0, -100, 10.5])("refuses an amount of %s", (amount) => {
    expect(refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-1", amount }], amount)).toEqual({
      kind: "invalid_amount",
      paymentId: "cash-1",
    });
  });

  it("accepts a refund imputed to a payment that was not made in cash", () => {
    expect(
      refundAllocationRefusal(PAYMENTS, [{ paymentId: "transfer-1", amount: 3000 }], 3000),
    ).toBeNull();
  });

  it("refuses more than a payment that was not made in cash still has left, saying how much", () => {
    expect(
      refundAllocationRefusal(PAYMENTS, [{ paymentId: "transfer-1", amount: 3001 }], 3001),
    ).toEqual({ kind: "exceeds_payment", paymentId: "transfer-1", remaining: 3000 });
  });

  it("refuses more than the payment still has left, saying how much that is", () => {
    expect(
      refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-1", amount: 4001 }], 4001),
    ).toEqual({ kind: "exceeds_payment", paymentId: "cash-1", remaining: 4000 });
  });

  it("adds up what is imputed to the same payment more than once", () => {
    expect(
      refundAllocationRefusal(
        PAYMENTS,
        [
          { paymentId: "cash-1", amount: 3000 },
          { paymentId: "cash-1", amount: 1001 },
        ],
        4001,
      ),
    ).toEqual({ kind: "exceeds_payment", paymentId: "cash-1", remaining: 4000 });
  });

  it("refuses an imputation that adds up to less than the refundable total", () => {
    expect(
      refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-1", amount: 1000 }], 1500),
    ).toEqual({
      kind: "total_mismatch",
      refundableTotal: 1500,
      imputed: 1000,
    });
  });

  it("refuses an imputation that adds up to more than the refundable total", () => {
    expect(
      refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-1", amount: 2000 }], 1500),
    ).toEqual({
      kind: "total_mismatch",
      refundableTotal: 1500,
      imputed: 2000,
    });
  });

  it("refuses to leave a refundable total with no imputation", () => {
    expect(refundAllocationRefusal(PAYMENTS, [], 1500)).toEqual({
      kind: "total_mismatch",
      refundableTotal: 1500,
      imputed: 0,
    });
  });

  it("answers an unknown payment before the amount", () => {
    expect(
      refundAllocationRefusal(
        PAYMENTS,
        [
          { paymentId: "transfer-1", amount: 100 },
          { paymentId: "cash-9", amount: 100 },
        ],
        1,
      ),
    ).toEqual({ kind: "unknown_payment", paymentId: "cash-9" });
  });

  it("answers a payment that cannot give that much before a total that does not match", () => {
    expect(refundAllocationRefusal(PAYMENTS, [{ paymentId: "cash-2", amount: 2001 }], 5)).toEqual({
      kind: "exceeds_payment",
      paymentId: "cash-2",
      remaining: 2000,
    });
  });

  it("accepts exactly the imputations that stay within each cash payment and add up to the total", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            amount: fc.integer({ min: 1, max: 10_000 }),
            refundedAmount: fc.integer({ min: 0, max: 10_000 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.array(fc.integer({ min: 1, max: 12_000 }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 30_000 }),
        (shapes, amounts, refundableTotal) => {
          const payments = shapes.map(({ amount, refundedAmount }, position) =>
            payment({ id: `cash-${position}`, amount, refundedAmount }),
          );
          const allocations = amounts
            .slice(0, payments.length)
            .map((amount, position) => ({ paymentId: `cash-${position}`, amount }));
          const withinPayments = allocations.every(
            ({ amount }, position) =>
              amount <=
              Math.max(
                0,
                (payments[position]?.amount ?? 0) - (payments[position]?.refundedAmount ?? 0),
              ),
          );
          const adds = allocations.reduce((sum, { amount }) => sum + amount, 0) === refundableTotal;

          expect(refundAllocationRefusal(payments, allocations, refundableTotal) === null).toBe(
            withinPayments && adds,
          );
        },
      ),
    );
  });
});
