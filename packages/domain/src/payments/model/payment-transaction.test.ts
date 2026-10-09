import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  expiryWithoutOrder,
  isValidOrderAmount,
  MERCADO_PAGO_ORDER_EXPIRY_MINUTES,
  mercadoPagoOrderExpiresAt,
  PAYMENT_TRANSACTION_STATES,
  type ProviderPaymentTransaction,
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

describe("ProviderPaymentTransaction", () => {
  it("is the transaction of a sale and nothing else", () => {
    type WithoutKind = Omit<ProviderPaymentTransaction, "kind">;

    expectTypeOf<WithoutKind>().not.toExtend<ProviderPaymentTransaction>();
    expectTypeOf<WithoutKind & { kind: "REFUND" }>().not.toExtend<ProviderPaymentTransaction>();
  });
});

describe("mercadoPagoOrderExpiresAt", () => {
  it("expires 5 minutes after the creation attempt starts, plus the longest the creation call can take", () => {
    expect(MERCADO_PAGO_ORDER_EXPIRY_MINUTES).toBe(5);
    expect(mercadoPagoOrderExpiresAt(new Date("2026-10-09T12:00:00.000Z"), 10_000)).toEqual(
      new Date("2026-10-09T12:05:10.000Z"),
    );
  });

  it("is never earlier than the attempt's start plus 5 minutes plus the longest call", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 0, max: 600_000 }),
        (attemptStartedAt, longestCallMs) =>
          mercadoPagoOrderExpiresAt(new Date(attemptStartedAt), longestCallMs).getTime() ===
          attemptStartedAt + 5 * 60 * 1000 + longestCallMs,
      ),
    );
  });

  it("does not change the attempt's start it is given", () => {
    const attemptStartedAt = new Date("2026-10-09T12:00:00.000Z");

    mercadoPagoOrderExpiresAt(attemptStartedAt, 10_000);

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
