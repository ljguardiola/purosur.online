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
    { method: "TRANSFER", provider: "NONE" },
    { method: "STANDALONE_TERMINAL", provider: "EXTERNAL_TERMINAL" },
  ] as const)("records who confirmed a $method payment and when", (kind) => {
    expect(
      paymentRecord({
        id: "payment-2",
        saleId: "sale-1",
        kind: "SALE",
        ...kind,
        amount: 5000,
        state: "APPROVED",
        occurredAt: OCCURRED_AT,
        authorizedBy: "cashier",
        confirmedAt: new Date("2026-10-09T12:00:30.000Z"),
      }),
    ).toMatchObject({
      ...kind,
      authorized_by: "cashier",
      confirmed_at: "2026-10-09T12:00:30.000Z",
    });
  });

  it.each(["DEBIT", "CREDIT"] as const)(
    "records the %s card a Point payment was charged on",
    (cardType) => {
      expect(
        paymentRecord({
          id: "payment-3",
          saleId: "sale-1",
          kind: "SALE",
          method: "POINT",
          provider: "MERCADOPAGO_POINT",
          cardType,
          amount: 5000,
          state: "APPROVED",
          occurredAt: OCCURRED_AT,
        }),
      ).toEqual({
        id: "payment-3",
        kind: "SALE",
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        card_type: cardType,
        amount: 5000,
        tendered: null,
        state: "APPROVED",
        occurred_at: "2026-10-09T12:01:00.000Z",
        authorized_by: null,
        confirmed_at: null,
      });
    },
  );

  it("refuses to record a Point payment charged on no card type", () => {
    expect(() =>
      paymentRecord({
        id: "payment-3",
        saleId: "sale-1",
        kind: "SALE",
        method: "POINT",
        provider: "MERCADOPAGO_POINT",
        cardType: null,
        amount: 5000,
        state: "APPROVED",
        occurredAt: OCCURRED_AT,
      }),
    ).toThrow("A Point payment must name its card type");
  });
});
