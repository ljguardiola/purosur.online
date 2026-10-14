import { describe, expect, it } from "vitest";
import type { PaymentTransactionState } from "../model/payment-transaction.js";
import { readPendingMercadoPagoPayments } from "./read-pending-mercado-pago-payments.js";
import { FakeMercadoPagoPayments } from "./test-support/fake-mercado-pago-payments.js";

const OCCURRED_AT = new Date("2026-10-13T12:00:00.000Z");

function paymentIn(paymentId: string, state: PaymentTransactionState, replaced = false) {
  return {
    paymentId,
    saleId: "sale-1",
    method: "QR" as const,
    amount: 3000,
    occurredAt: OCCURRED_AT,
    state,
    replaced,
  };
}

describe("readPendingMercadoPagoPayments", () => {
  it("answers the payments still pending, with their sale, method, amount and time", () => {
    const payments = new FakeMercadoPagoPayments([paymentIn("qr-1", "PENDING")]);

    expect(readPendingMercadoPagoPayments({ payments })).toEqual([
      { paymentId: "qr-1", saleId: "sale-1", method: "QR", amount: 3000, occurredAt: OCCURRED_AT },
    ]);
  });

  it("leaves out the payments that ended and the pending one another replaced", () => {
    const payments = new FakeMercadoPagoPayments([
      paymentIn("approved", "APPROVED"),
      paymentIn("declined", "DECLINED"),
      paymentIn("cancelled", "CANCELLED"),
      paymentIn("expired", "EXPIRED"),
      paymentIn("replaced", "PENDING", true),
    ]);

    expect(readPendingMercadoPagoPayments({ payments })).toEqual([]);
  });
});
