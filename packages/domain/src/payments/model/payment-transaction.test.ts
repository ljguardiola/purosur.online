import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  awaitsUnrecordedOrder,
  expiryWithoutOrder,
  isLateApproval,
  isValidOrderAmount,
  type MercadoPagoOrderTransaction,
  type MercadoPagoPointPaymentTransaction,
  mayHaveUnrecordedOrder,
  mercadoPagoOrderExpiresAt,
  PAYMENT_TRANSACTION_STATES,
  type PaymentTransaction,
  type PendingMercadoPagoSalePayment,
  type SalePayment,
} from "./payment-transaction.js";

describe("PAYMENT_TRANSACTION_STATES", () => {
  it("moves from pending to approved, declined, cancelled or expired", () => {
    expect(PAYMENT_TRANSACTION_STATES).toEqual([
      "PENDING",
      "APPROVED",
      "DECLINED",
      "CANCELLED",
      "EXPIRED",
    ]);
  });
});

describe("PaymentTransaction", () => {
  it("is the transaction of a sale and nothing else", () => {
    expectTypeOf<PaymentTransaction["kind"]>().toEqualTypeOf<"SALE">();
  });

  it("records what the register and the cloud each know of a transaction as that transaction", () => {
    expectTypeOf<SalePayment>().toExtend<PaymentTransaction>();
    expectTypeOf<PendingMercadoPagoSalePayment>().toExtend<PaymentTransaction>();
    expectTypeOf<MercadoPagoOrderTransaction>().toExtend<PaymentTransaction>();
  });

  it("records only approved payments in a sale", () => {
    expectTypeOf<
      Omit<Extract<SalePayment, { method: "QR" }>, "state"> & { state: "PENDING" }
    >().not.toExtend<SalePayment>();
  });

  it("records the cloud's Mercado Pago QR transaction as the transaction of a sale and nothing else", () => {
    type WithoutKind = Omit<MercadoPagoOrderTransaction, "kind">;

    expectTypeOf<WithoutKind>().not.toExtend<MercadoPagoOrderTransaction>();
    expectTypeOf<WithoutKind & { kind: "REFUND" }>().not.toExtend<MercadoPagoOrderTransaction>();
  });
});

describe("MercadoPagoPointPaymentTransaction", () => {
  it("is a payment transaction of a sale by the integrated terminal", () => {
    expectTypeOf<MercadoPagoPointPaymentTransaction>().toExtend<PaymentTransaction>();
    expectTypeOf<MercadoPagoPointPaymentTransaction["method"]>().toEqualTypeOf<"POINT">();
    expectTypeOf<
      MercadoPagoPointPaymentTransaction["provider"]
    >().toEqualTypeOf<"MERCADOPAGO_POINT">();
  });

  it("is a Mercado Pago order beside the QR one, kept on the same model", () => {
    expectTypeOf<MercadoPagoOrderTransaction["method"]>().toEqualTypeOf<"QR" | "POINT">();
    expectTypeOf<MercadoPagoOrderTransaction["provider"]>().toEqualTypeOf<
      "MERCADOPAGO_QR" | "MERCADOPAGO_POINT"
    >();
  });

  it("does not mix a QR method with the Point provider", () => {
    expectTypeOf<
      Omit<MercadoPagoOrderTransaction, "method" | "provider"> & {
        method: "QR";
        provider: "MERCADOPAGO_POINT";
      }
    >().not.toExtend<MercadoPagoOrderTransaction>();
  });

  it("carries nothing about the card that paid", () => {
    expectTypeOf<keyof MercadoPagoPointPaymentTransaction>().not.toExtend<
      "cardLastDigits" | "cardType" | "cardBrand" | "cardholderName"
    >();
  });

  it("is a pending sale payment as well while its wait runs", () => {
    expectTypeOf<
      Extract<PendingMercadoPagoSalePayment, { method: "POINT" }>["provider"]
    >().toEqualTypeOf<"MERCADOPAGO_POINT">();
  });
});

describe("mercadoPagoOrderExpiresAt", () => {
  it("expires when the order's lifetime ends, plus the longest the creation call can take", () => {
    expect(mercadoPagoOrderExpiresAt(new Date("2026-10-09T12:00:00.000Z"), 3, 10_000)).toEqual(
      new Date("2026-10-09T12:03:10.000Z"),
    );
  });

  it("is exactly the attempt's start plus the lifetime plus the longest call", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 600_000 }),
        (attemptStartedAt, lifetimeMinutes, longestCallMs) =>
          mercadoPagoOrderExpiresAt(
            new Date(attemptStartedAt),
            lifetimeMinutes,
            longestCallMs,
          ).getTime() ===
          attemptStartedAt + lifetimeMinutes * 60 * 1000 + longestCallMs,
      ),
    );
  });

  it("does not change the attempt's start it is given", () => {
    const attemptStartedAt = new Date("2026-10-09T12:00:00.000Z");

    mercadoPagoOrderExpiresAt(attemptStartedAt, 3, 10_000);

    expect(attemptStartedAt).toEqual(new Date("2026-10-09T12:00:00.000Z"));
  });
});

describe("expiryWithoutOrder", () => {
  const EXPIRES_AT = new Date("2026-10-09T12:05:00.000Z");
  const LATER = new Date("2026-10-09T13:00:00.000Z");
  const WITHOUT_ORDER = {
    state: "PENDING",
    providerOrderId: null,
    expiresAt: EXPIRES_AT,
    creationOutcomeUnknown: false,
  } as const;
  const UNKNOWN_CREATION = { ...WITHOUT_ORDER, creationOutcomeUnknown: true };

  it("ends a pending transaction as expired once its expiry is reached when no attempt may have created an order", () => {
    expect(expiryWithoutOrder(WITHOUT_ORDER, EXPIRES_AT)).toBe("expired");
    expect(expiryWithoutOrder(WITHOUT_ORDER, LATER)).toBe("expired");
  });

  it("leaves a pending transaction for a person to review once its expiry is reached when an attempt may have created an order", () => {
    expect(expiryWithoutOrder(UNKNOWN_CREATION, EXPIRES_AT)).toBe("needs_review");
    expect(expiryWithoutOrder(UNKNOWN_CREATION, LATER)).toBe("needs_review");
  });

  it("keeps a pending transaction without an order open until its expiry", () => {
    const justBefore = new Date("2026-10-09T12:04:59.999Z");

    expect(expiryWithoutOrder(WITHOUT_ORDER, justBefore)).toBeNull();
    expect(expiryWithoutOrder(UNKNOWN_CREATION, justBefore)).toBeNull();
  });

  it("leaves a transaction with an order to what its order reports", () => {
    expect(expiryWithoutOrder({ ...WITHOUT_ORDER, providerOrderId: "order-1" }, LATER)).toBeNull();
    expect(
      expiryWithoutOrder({ ...UNKNOWN_CREATION, providerOrderId: "order-1" }, LATER),
    ).toBeNull();
  });

  it.each(PAYMENT_TRANSACTION_STATES.filter((state) => state !== "PENDING"))(
    "leaves a %s transaction as it is",
    (state) => {
      expect(expiryWithoutOrder({ ...WITHOUT_ORDER, state }, LATER)).toBeNull();
      expect(expiryWithoutOrder({ ...UNKNOWN_CREATION, state }, LATER)).toBeNull();
    },
  );
});

describe("awaitsUnrecordedOrder", () => {
  const AWAITING_ORDER = {
    state: "PENDING",
    providerOrderId: null,
    creationOutcomeUnknown: true,
  } as const;

  it("holds for a pending transaction without an order whose creation outcome is unknown", () => {
    expect(awaitsUnrecordedOrder(AWAITING_ORDER)).toBe(true);
  });

  it("does not hold when the creation is known to have created nothing", () => {
    expect(awaitsUnrecordedOrder({ ...AWAITING_ORDER, creationOutcomeUnknown: false })).toBe(false);
  });

  it("does not hold once an order is recorded", () => {
    expect(awaitsUnrecordedOrder({ ...AWAITING_ORDER, providerOrderId: "order-1" })).toBe(false);
  });

  it.each(PAYMENT_TRANSACTION_STATES.filter((state) => state !== "PENDING"))(
    "does not hold for a %s transaction",
    (state) => {
      expect(awaitsUnrecordedOrder({ ...AWAITING_ORDER, state })).toBe(false);
    },
  );
});

describe("mayHaveUnrecordedOrder", () => {
  function transactionWhoseCreation(
    outcome: "unknown" | "known",
    overrides: Partial<Pick<MercadoPagoOrderTransaction, "state" | "providerOrderId">> = {},
  ) {
    return {
      state: "PENDING",
      providerOrderId: null,
      creationOutcomeUnknown: outcome === "unknown",
      ...overrides,
    };
  }

  it("holds for a transaction whose creation outcome is unknown, even once an order is recorded", () => {
    expect(mayHaveUnrecordedOrder(transactionWhoseCreation("unknown"))).toBe(true);
    expect(
      mayHaveUnrecordedOrder(transactionWhoseCreation("unknown", { providerOrderId: "order-1" })),
    ).toBe(true);
  });

  it.each(PAYMENT_TRANSACTION_STATES)(
    "holds for a %s transaction whose creation outcome is unknown",
    (state) => {
      expect(mayHaveUnrecordedOrder(transactionWhoseCreation("unknown", { state }))).toBe(true);
    },
  );

  it("does not hold when the creation outcome is known", () => {
    expect(mayHaveUnrecordedOrder(transactionWhoseCreation("known"))).toBe(false);
    expect(
      mayHaveUnrecordedOrder(transactionWhoseCreation("known", { providerOrderId: "order-1" })),
    ).toBe(false);
  });
});

describe("isValidOrderAmount", () => {
  it("accepts a positive whole number of cents", () => {
    expect(isValidOrderAmount(1)).toBe(true);
    expect(isValidOrderAmount(250050)).toBe(true);
  });

  it.each([0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuses %s",
    (amount) => {
      expect(isValidOrderAmount(amount)).toBe(false);
    },
  );

  it("accepts every positive safe integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (amount) =>
        isValidOrderAmount(amount),
      ),
    );
  });
});

describe("isLateApproval", () => {
  it("holds for a payment approved after the register replaced it", () => {
    expect(isLateApproval({ state: "APPROVED", replaced: true })).toBe(true);
  });

  it("does not hold for an approved payment the register still waited on", () => {
    expect(isLateApproval({ state: "APPROVED", replaced: false })).toBe(false);
  });

  it.each(PAYMENT_TRANSACTION_STATES.filter((state) => state !== "APPROVED"))(
    "does not hold for a replaced payment that is %s",
    (state) => {
      expect(isLateApproval({ state, replaced: true })).toBe(false);
    },
  );
});
