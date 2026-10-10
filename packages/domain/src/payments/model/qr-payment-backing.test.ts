import { describe, expect, it } from "vitest";
import { qrPaymentIsBacked } from "./qr-payment-backing.js";

const PAYMENT = { saleId: "sale-1", amount: 3070000 };
const APPROVED = { saleId: "sale-1", amount: 3070000, state: "APPROVED" } as const;

describe("qrPaymentIsBacked", () => {
  it("is backed by an approved transaction of the same sale and amount", () => {
    expect(qrPaymentIsBacked(PAYMENT, APPROVED)).toBe(true);
  });

  it("is not backed when the provider has no transaction for the payment", () => {
    expect(qrPaymentIsBacked(PAYMENT, null)).toBe(false);
  });

  it.each(["PENDING", "DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "is not backed by a %s transaction",
    (state) => {
      expect(qrPaymentIsBacked(PAYMENT, { ...APPROVED, state })).toBe(false);
    },
  );

  it("is not backed by a transaction of another sale", () => {
    expect(qrPaymentIsBacked(PAYMENT, { ...APPROVED, saleId: "sale-2" })).toBe(false);
  });

  it("is not backed by a transaction of a higher or a lower amount", () => {
    expect(qrPaymentIsBacked(PAYMENT, { ...APPROVED, amount: PAYMENT.amount + 1 })).toBe(false);
    expect(qrPaymentIsBacked(PAYMENT, { ...APPROVED, amount: PAYMENT.amount - 1 })).toBe(false);
  });
});
