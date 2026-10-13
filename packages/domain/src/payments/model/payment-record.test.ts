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

  it.each([
    ["TRANSFER", "NONE"],
    ["STANDALONE_TERMINAL", "EXTERNAL_TERMINAL"],
  ] as const)("records who confirmed a %s payment and when", (method, provider) => {
    expect(
      paymentRecord({
        id: "payment-2",
        saleId: "sale-1",
        kind: "SALE",
        method,
        provider,
        amount: 5000,
        state: "APPROVED",
        occurredAt: OCCURRED_AT,
        authorizedBy: "cashier",
        confirmedAt: new Date("2026-10-09T12:00:30.000Z"),
      }),
    ).toMatchObject({
      method,
      provider,
      authorized_by: "cashier",
      confirmed_at: "2026-10-09T12:00:30.000Z",
    });
  });
});
