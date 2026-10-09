import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isValidOrderAmount,
  MERCADO_PAGO_ORDER_EXPIRY_MINUTES,
  mercadoPagoOrderExpiresAt,
  PAYMENT_TRANSACTION_STATES,
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

describe("mercadoPagoOrderExpiresAt", () => {
  it("expires the order 5 minutes after it is created", () => {
    expect(MERCADO_PAGO_ORDER_EXPIRY_MINUTES).toBe(5);
    expect(mercadoPagoOrderExpiresAt(new Date("2026-10-09T12:00:00.000Z"))).toEqual(
      new Date("2026-10-09T12:05:00.000Z"),
    );
  });

  it("does not change the creation moment it is given", () => {
    const createdAt = new Date("2026-10-09T12:00:00.000Z");

    mercadoPagoOrderExpiresAt(createdAt);

    expect(createdAt).toEqual(new Date("2026-10-09T12:00:00.000Z"));
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
