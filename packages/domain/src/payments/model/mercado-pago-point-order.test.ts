import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES } from "./mercado-pago-order-charge-wait.js";
import {
  isValidPointOrderAmount,
  MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS,
  MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES,
} from "./mercado-pago-point-order.js";

describe("the integrated terminal's order policy", () => {
  it("charges at least $15", () => {
    expect(MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS).toBe(1500);
  });

  it("keeps an order alive on the terminal for 5 minutes", () => {
    expect(MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES).toBe(5);
  });

  it("outlasts the register's wait, so a customer still paying when the wait ends is not cut off", () => {
    expect(MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES).toBeGreaterThan(
      MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES,
    );
  });
});

describe("isValidPointOrderAmount", () => {
  it("accepts exactly the minimum", () => {
    expect(isValidPointOrderAmount(1500)).toBe(true);
  });

  it("refuses one cent under the minimum", () => {
    expect(isValidPointOrderAmount(1499)).toBe(false);
  });

  it("accepts any whole number of cents from the minimum up", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS, max: Number.MAX_SAFE_INTEGER }),
        isValidPointOrderAmount,
      ),
    );
  });

  it("refuses any whole number of cents under the minimum", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS - 1 }),
        (cents) => !isValidPointOrderAmount(cents),
      ),
    );
  });

  it("refuses an amount that is not a safe whole number of cents", () => {
    expect(isValidPointOrderAmount(2500.5)).toBe(false);
    expect(isValidPointOrderAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isValidPointOrderAmount(Number.NaN)).toBe(false);
    expect(isValidPointOrderAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
