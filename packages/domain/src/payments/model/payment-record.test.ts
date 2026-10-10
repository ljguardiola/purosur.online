import { describe, expect, it } from "vitest";
import { paymentRecord } from "./payment-record.js";

const OCCURRED_AT = new Date("2026-10-09T12:01:00.000Z");

describe("paymentRecord", () => {
  it("records an approved Mercado Pago QR payment with no tendered amount nor confirmation", () => {
    expect(
      paymentRecord({
        id: "payment-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 5000,
        state: "APPROVED",
        occurredAt: OCCURRED_AT,
      }),
    ).toEqual({
      id: "payment-1",
      kind: "SALE",
      method: "QR",
      provider: "MERCADOPAGO_QR",
      amount: 5000,
      tendered: null,
      state: "APPROVED",
      occurred_at: "2026-10-09T12:01:00.000Z",
      authorized_by: null,
      confirmed_at: null,
    });
  });
});
