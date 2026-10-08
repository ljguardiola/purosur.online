import { describe, expect, expectTypeOf, it } from "vitest";
import {
  cancellableWithoutAuthorization,
  hasApprovedPayment,
  type PaymentTransaction,
} from "./payment.js";

const APPROVED: PaymentTransaction = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 2500,
  state: "APPROVED",
  occurredAt: new Date("2026-09-30T12:00:00.000Z"),
};

describe("cancellableWithoutAuthorization", () => {
  it("allows cancelling a sale that has no payment", () => {
    expect(cancellableWithoutAuthorization([])).toBe(true);
  });

  it("refuses cancelling a sale with an approved payment", () => {
    expect(cancellableWithoutAuthorization([APPROVED])).toBe(false);
  });

  it("allows cancelling a sale whose payments are not approved", () => {
    expect(cancellableWithoutAuthorization([{ state: "DECLINED" }])).toBe(true);
  });

  it("refuses when any of several payments is approved", () => {
    expect(cancellableWithoutAuthorization([APPROVED, { ...APPROVED, id: "payment-2" }])).toBe(
      false,
    );
  });
});

describe("hasApprovedPayment", () => {
  it("is false for a sale without payments", () => {
    expect(hasApprovedPayment([])).toBe(false);
  });

  it("is true when a payment is approved", () => {
    expect(hasApprovedPayment([APPROVED])).toBe(true);
  });

  it("is false when no payment is approved", () => {
    expect(hasApprovedPayment([{ state: "DECLINED" }])).toBe(false);
  });
});

describe("PaymentTransaction", () => {
  it("does not accept a transfer without who confirmed it and when", () => {
    type Transfer = Extract<PaymentTransaction, { method: "TRANSFER" }>;

    expectTypeOf<Omit<Transfer, "authorizedBy">>().not.toExtend<PaymentTransaction>();
    expectTypeOf<Omit<Transfer, "confirmedAt">>().not.toExtend<PaymentTransaction>();
  });
});
