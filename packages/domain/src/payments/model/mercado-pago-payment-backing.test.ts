import { describe, expect, it } from "vitest";
import {
  mercadoPagoPaymentIsBacked,
  rebuiltPaidOrderPaymentIsBacked,
} from "./mercado-pago-payment-backing.js";

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

describe("rebuiltPaidOrderPaymentIsBacked", () => {
  const applied = { amount: 2000, method: "QR" } as const;
  const paidOrder = { amount: 5000, state: "APPROVED", method: "QR" } as const;

  it("is backed by an approved transaction of the same method whose amount is the payment plus the surplus", () => {
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 3000, paidOrder)).toBe(true);
  });

  it("does not ask for the transaction to belong to the sale", () => {
    expect(
      rebuiltPaidOrderPaymentIsBacked(applied, 3000, { ...paidOrder, saleId: "another-sale" }),
    ).toBe(true);
  });

  it("is backed by a transaction of exactly the payment's amount when there is no surplus", () => {
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 0, { ...paidOrder, amount: 2000 })).toBe(true);
  });

  it("is not backed when the surplus does not make up the transaction's amount", () => {
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 2999, paidOrder)).toBe(false);
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 3001, paidOrder)).toBe(false);
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 0, paidOrder)).toBe(false);
  });

  it("is not backed by a transaction of the other method", () => {
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 3000, { ...paidOrder, method: "POINT" })).toBe(
      false,
    );
  });

  it("is not backed when the provider has no transaction for the payment", () => {
    expect(rebuiltPaidOrderPaymentIsBacked(applied, 3000, null)).toBe(false);
  });

  it.each(["PENDING", "DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "is not backed by a %s transaction",
    (state) => {
      expect(rebuiltPaidOrderPaymentIsBacked(applied, 3000, { ...paidOrder, state })).toBe(false);
    },
  );
});
