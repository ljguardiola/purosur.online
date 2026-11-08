import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isValidQrOrderAmount,
  MERCADO_PAGO_QR_MINIMUM_ORDER_CENTS,
} from "./mercado-pago-qr-order.js";

describe("the QR order's policy", () => {
  it("charges at least $15", () => {
    expect(MERCADO_PAGO_QR_MINIMUM_ORDER_CENTS).toBe(1500);
  });
});

describe("isValidQrOrderAmount", () => {
  it("accepts exactly the minimum", () => {
    expect(isValidQrOrderAmount(1500)).toBe(true);
  });

  it("refuses one cent under the minimum", () => {
    expect(isValidQrOrderAmount(1499)).toBe(false);
  });

  it("accepts any whole number of cents from the minimum up", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MERCADO_PAGO_QR_MINIMUM_ORDER_CENTS, max: Number.MAX_SAFE_INTEGER }),
        isValidQrOrderAmount,
      ),
    );
  });

  it("refuses any whole number of cents under the minimum", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: MERCADO_PAGO_QR_MINIMUM_ORDER_CENTS - 1 }),
        (cents) => !isValidQrOrderAmount(cents),
      ),
    );
  });

  it("refuses an amount that is not a safe whole number of cents", () => {
    expect(isValidQrOrderAmount(2500.5)).toBe(false);
    expect(isValidQrOrderAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isValidQrOrderAmount(Number.NaN)).toBe(false);
    expect(isValidQrOrderAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
