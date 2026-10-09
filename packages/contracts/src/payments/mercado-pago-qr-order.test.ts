import { describe, expect, it } from "vitest";
import {
  mercadoPagoQrOrderRequestSchema,
  mercadoPagoQrPaymentSchema,
} from "./mercado-pago-qr-order.js";

const TRANSACTION_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const SALE_ID = "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const request: Record<string, unknown> = {
  payment_transaction_id: TRANSACTION_ID,
  sale_id: SALE_ID,
  amount: 2500,
};

const payment: Record<string, unknown> = {
  payment_transaction_id: TRANSACTION_ID,
  state: "PENDING",
  needs_review: false,
  amount: 2500,
  expires_at: "2026-10-09T12:05:00.000Z",
};

describe("mercadoPagoQrOrderRequestSchema", () => {
  it("accepts a payment transaction for a sale with an amount in cents", () => {
    expect(mercadoPagoQrOrderRequestSchema.parse(request)).toEqual(request);
  });

  it.each([0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1])("refuses the amount %s", (amount) => {
    expect(mercadoPagoQrOrderRequestSchema.safeParse({ ...request, amount }).success).toBe(false);
  });

  it.each(["payment_transaction_id", "sale_id", "amount"])(
    "refuses a request without %s",
    (key) => {
      const { [key]: _removed, ...rest } = request;

      expect(mercadoPagoQrOrderRequestSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("refuses an id that is not a record id", () => {
    expect(
      mercadoPagoQrOrderRequestSchema.safeParse({ ...request, payment_transaction_id: "x" })
        .success,
    ).toBe(false);
  });
});

describe("mercadoPagoQrPaymentSchema", () => {
  it("accepts the state of a payment with the moment its order expires", () => {
    expect(mercadoPagoQrPaymentSchema.parse(payment)).toEqual(payment);
  });

  it.each(["PENDING", "APPROVED", "DECLINED", "CANCELLED", "EXPIRED"])(
    "accepts the state %s",
    (state) => {
      expect(mercadoPagoQrPaymentSchema.safeParse({ ...payment, state }).success).toBe(true);
    },
  );

  it("refuses a state the payment transaction never has", () => {
    expect(mercadoPagoQrPaymentSchema.safeParse({ ...payment, state: "PAID" }).success).toBe(false);
  });

  it("refuses an expiry that is not an instant", () => {
    expect(
      mercadoPagoQrPaymentSchema.safeParse({ ...payment, expires_at: "tomorrow" }).success,
    ).toBe(false);
  });

  it.each(["payment_transaction_id", "state", "needs_review", "amount", "expires_at"])(
    "refuses an answer without %s",
    (key) => {
      const { [key]: _removed, ...rest } = payment;

      expect(mercadoPagoQrPaymentSchema.safeParse(rest).success).toBe(false);
    },
  );
});
