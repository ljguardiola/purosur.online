import { describe, expect, it } from "vitest";
import { mercadoPagoPaymentIsBacked } from "./mercado-pago-payment-backing.js";

const PAYMENT = { saleId: "sale-1", amount: 3070000, method: "QR" } as const;
const APPROVED = { saleId: "sale-1", amount: 3070000, state: "APPROVED", method: "QR" } as const;

describe("mercadoPagoPaymentIsBacked", () => {
  it("is backed by an approved transaction of the same sale, amount and method", () => {
    expect(mercadoPagoPaymentIsBacked(PAYMENT, APPROVED)).toBe(true);
  });

  it("is backed when an integrated terminal payment meets an approved transaction of that terminal", () => {
    expect(
      mercadoPagoPaymentIsBacked({ ...PAYMENT, method: "POINT" }, { ...APPROVED, method: "POINT" }),
    ).toBe(true);
  });

  it("is not backed by a transaction of the other method", () => {
    expect(mercadoPagoPaymentIsBacked(PAYMENT, { ...APPROVED, method: "POINT" })).toBe(false);
    expect(mercadoPagoPaymentIsBacked({ ...PAYMENT, method: "POINT" }, APPROVED)).toBe(false);
  });

  it("is not backed when the provider has no transaction for the payment", () => {
    expect(mercadoPagoPaymentIsBacked(PAYMENT, null)).toBe(false);
  });

  it.each(["PENDING", "DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "is not backed by a %s transaction",
    (state) => {
      expect(mercadoPagoPaymentIsBacked(PAYMENT, { ...APPROVED, state })).toBe(false);
    },
  );

  it("is not backed by a transaction of another sale", () => {
    expect(mercadoPagoPaymentIsBacked(PAYMENT, { ...APPROVED, saleId: "sale-2" })).toBe(false);
  });

  it("is not backed by a transaction of a higher or a lower amount", () => {
    expect(mercadoPagoPaymentIsBacked(PAYMENT, { ...APPROVED, amount: PAYMENT.amount + 1 })).toBe(
      false,
    );
    expect(mercadoPagoPaymentIsBacked(PAYMENT, { ...APPROVED, amount: PAYMENT.amount - 1 })).toBe(
      false,
    );
  });
});
