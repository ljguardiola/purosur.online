import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyMercadoPagoOrderResult,
  type MercadoPagoOrderResult,
  paymentStateOfMercadoPagoOrder,
} from "./mercado-pago-order-result.js";
import { PAYMENT_TRANSACTION_STATES } from "./payment-transaction.js";

const ACCREDITED = { status: "processed", statusDetail: "accredited", paidAmount: 2500 } as const;

function order(overrides: Partial<MercadoPagoOrderResult> = {}): MercadoPagoOrderResult {
  return {
    status: "processed",
    statusDetail: "accredited",
    totalAmount: 2500,
    totalPaidAmount: 2500,
    payments: [ACCREDITED],
    ...overrides,
  };
}

const orderResultArbitrary = fc.record({
  status: fc.constantFrom(
    "processed",
    "refunded",
    "canceled",
    "expired",
    "failed",
    "created",
    "action_required",
    "something_new",
  ),
  statusDetail: fc.constantFrom("accredited", "partially_refunded", "other"),
  totalAmount: fc.integer({ min: 1, max: 1_000_000 }),
  totalPaidAmount: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
  payments: fc.array(
    fc.record({
      status: fc.constantFrom("processed", "failed", "created"),
      statusDetail: fc.constantFrom("accredited", "other"),
      paidAmount: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
    }),
    { maxLength: 3 },
  ),
});

describe("paymentStateOfMercadoPagoOrder", () => {
  it("approves a processed order whose payments are all accredited and whose paid amount equals the order amount", () => {
    expect(paymentStateOfMercadoPagoOrder(order(), 2500)).toEqual({
      state: "APPROVED",
      needsReview: false,
    });
  });

  it("takes the paid amount from the payments when the order does not state it", () => {
    const split = order({
      totalPaidAmount: null,
      payments: [
        { ...ACCREDITED, paidAmount: 1000 },
        { ...ACCREDITED, paidAmount: 1500 },
      ],
    });

    expect(paymentStateOfMercadoPagoOrder(split, 2500)).toEqual({
      state: "APPROVED",
      needsReview: false,
    });
  });

  it("prefers the paid amount the order states over the sum of its payments", () => {
    const disagreeing = order({
      totalPaidAmount: 2500,
      payments: [{ ...ACCREDITED, paidAmount: 1 }],
    });

    expect(paymentStateOfMercadoPagoOrder(disagreeing, 2500).state).toBe("APPROVED");
  });

  it.each([2499, 2501])("leaves a processed order paid %i for a person to review", (paid) => {
    expect(
      paymentStateOfMercadoPagoOrder(
        order({ totalPaidAmount: paid, payments: [{ ...ACCREDITED, paidAmount: paid }] }),
        2500,
      ),
    ).toEqual({ state: "PENDING", needsReview: true });
  });

  it("leaves a processed order whose paid amount is unknown for a person to review", () => {
    const unknown = order({
      totalPaidAmount: null,
      payments: [{ ...ACCREDITED, paidAmount: null }],
    });

    expect(paymentStateOfMercadoPagoOrder(unknown, 2500)).toEqual({
      state: "PENDING",
      needsReview: true,
    });
  });

  it("leaves a processed order without payments for a person to review", () => {
    expect(paymentStateOfMercadoPagoOrder(order({ payments: [] }), 2500)).toEqual({
      state: "PENDING",
      needsReview: true,
    });
  });

  it("leaves a processed order with a payment that is not accredited for a person to review", () => {
    const notAccredited = order({
      payments: [ACCREDITED, { ...ACCREDITED, statusDetail: "pending_review_manual" }],
    });

    expect(paymentStateOfMercadoPagoOrder(notAccredited, 2500)).toEqual({
      state: "PENDING",
      needsReview: true,
    });
  });

  it("leaves a processed order with a payment that is not processed for a person to review", () => {
    const notProcessed = order({ payments: [{ ...ACCREDITED, status: "failed" }] });

    expect(paymentStateOfMercadoPagoOrder(notProcessed, 2500).needsReview).toBe(true);
  });

  it("leaves a processed order that was partially refunded for a person to review", () => {
    expect(
      paymentStateOfMercadoPagoOrder(order({ statusDetail: "partially_refunded" }), 2500),
    ).toEqual({ state: "PENDING", needsReview: true });
  });

  it("approves an order whose own detail reads processed while its payments are accredited", () => {
    expect(paymentStateOfMercadoPagoOrder(order({ statusDetail: "processed" }), 2500)).toEqual({
      state: "APPROVED",
      needsReview: false,
    });
  });

  it("leaves a processed order whose own detail is neither accredited nor processed for a person to review", () => {
    expect(paymentStateOfMercadoPagoOrder(order({ statusDetail: "other" }), 2500)).toEqual({
      state: "PENDING",
      needsReview: true,
    });
  });

  it("leaves a refunded order for a person to review", () => {
    expect(paymentStateOfMercadoPagoOrder(order({ status: "refunded" }), 2500)).toEqual({
      state: "PENDING",
      needsReview: true,
    });
  });

  it.each([
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
    ["failed", "DECLINED"],
  ] as const)("ends an order reported %s as %s", (status, state) => {
    expect(paymentStateOfMercadoPagoOrder(order({ status }), 2500)).toEqual({
      state,
      needsReview: false,
    });
  });

  it.each(["created", "processing", "action_required", "at_terminal", "something_new"])(
    "leaves an order reported %s pending without review",
    (status) => {
      expect(paymentStateOfMercadoPagoOrder(order({ status }), 2500)).toEqual({
        state: "PENDING",
        needsReview: false,
      });
    },
  );

  it("never approves an order whose paid amount differs from the order amount", () => {
    fc.assert(
      fc.property(
        orderResultArbitrary,
        fc.integer({ min: 1, max: 1_000_000 }),
        (result, amount) => {
          const known =
            result.totalPaidAmount ??
            (result.payments.some(({ paidAmount }) => paidAmount === null)
              ? null
              : result.payments.reduce((sum, { paidAmount }) => sum + (paidAmount ?? 0), 0));
          fc.pre(known !== amount);

          return paymentStateOfMercadoPagoOrder(result, amount).state !== "APPROVED";
        },
      ),
    );
  });

  it("asks for a review only for a pending payment", () => {
    fc.assert(
      fc.property(
        orderResultArbitrary,
        fc.integer({ min: 1, max: 1_000_000 }),
        (result, amount) => {
          const { state, needsReview } = paymentStateOfMercadoPagoOrder(result, amount);

          return !needsReview || state === "PENDING";
        },
      ),
    );
  });
});

describe("applyMercadoPagoOrderResult", () => {
  it("moves a pending payment to the state the order reports", () => {
    expect(
      applyMercadoPagoOrderResult({ state: "PENDING", needsReview: false, amount: 2500 }, order()),
    ).toEqual({ state: "APPROVED", needsReview: false });
  });

  it.each(PAYMENT_TRANSACTION_STATES.filter((state) => state !== "PENDING"))(
    "leaves a %s payment exactly as it is whatever the order reports",
    (state) => {
      fc.assert(
        fc.property(orderResultArbitrary, fc.boolean(), (result, needsReview) => {
          expect(
            applyMercadoPagoOrderResult({ state, needsReview, amount: result.totalAmount }, result),
          ).toEqual({ state, needsReview });
        }),
      );
    },
  );
});
