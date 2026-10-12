import { describe, expect, it } from "vitest";
import {
  mercadoPagoCancellationSchema,
  mercadoPagoOrderRequestSchema,
  mercadoPagoPaymentSchema,
} from "./mercado-pago-order.js";

const TRANSACTION_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const SALE_ID = "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const request: Record<string, unknown> = {
  payment_transaction_id: TRANSACTION_ID,
  sale_id: SALE_ID,
  provider: "MERCADOPAGO_QR",
  amount: 2500,
};

const payment: Record<string, unknown> = {
  payment_transaction_id: TRANSACTION_ID,
  state: "PENDING",
  needs_review: false,
  provider: "MERCADOPAGO_QR",
  amount: 2500,
  expires_at: "2026-10-09T12:05:00.000Z",
};

describe("mercadoPagoOrderRequestSchema", () => {
  it("accepts a payment transaction for a sale with an amount in cents", () => {
    expect(mercadoPagoOrderRequestSchema.parse(request)).toEqual(request);
  });

  it.each([0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1])("refuses the amount %s", (amount) => {
    expect(mercadoPagoOrderRequestSchema.safeParse({ ...request, amount }).success).toBe(false);
  });

  it("accepts an order for the integrated terminal", () => {
    const onTheTerminal = { ...request, provider: "MERCADOPAGO_POINT" };

    expect(mercadoPagoOrderRequestSchema.parse(onTheTerminal)).toEqual(onTheTerminal);
  });

  it.each(["NONE", "MERCADOPAGO", "point", 1])("refuses the provider %s", (provider) => {
    expect(mercadoPagoOrderRequestSchema.safeParse({ ...request, provider }).success).toBe(false);
  });

  it.each(["payment_transaction_id", "sale_id", "provider", "amount"])(
    "refuses a request without %s",
    (key) => {
      const { [key]: _removed, ...rest } = request;

      expect(mercadoPagoOrderRequestSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("refuses an id that is not a record id", () => {
    expect(
      mercadoPagoOrderRequestSchema.safeParse({ ...request, payment_transaction_id: "x" }).success,
    ).toBe(false);
  });
});

describe("mercadoPagoPaymentSchema", () => {
  it("accepts the state of a payment with the moment its order expires", () => {
    expect(mercadoPagoPaymentSchema.parse(payment)).toEqual(payment);
  });

  it.each(["PENDING", "APPROVED", "DECLINED", "CANCELLED", "EXPIRED"])(
    "accepts the state %s",
    (state) => {
      expect(mercadoPagoPaymentSchema.safeParse({ ...payment, state }).success).toBe(true);
    },
  );

  it("accepts the answer for a payment on the integrated terminal", () => {
    const onTheTerminal = { ...payment, provider: "MERCADOPAGO_POINT" };

    expect(mercadoPagoPaymentSchema.parse(onTheTerminal)).toEqual(onTheTerminal);
  });

  it("refuses a state the payment transaction never has", () => {
    expect(mercadoPagoPaymentSchema.safeParse({ ...payment, state: "PAID" }).success).toBe(false);
  });

  it("refuses an expiry that is not an instant", () => {
    expect(mercadoPagoPaymentSchema.safeParse({ ...payment, expires_at: "tomorrow" }).success).toBe(
      false,
    );
  });

  it.each(["payment_transaction_id", "state", "needs_review", "provider", "amount", "expires_at"])(
    "refuses an answer without %s",
    (key) => {
      const { [key]: _removed, ...rest } = payment;

      expect(mercadoPagoPaymentSchema.safeParse(rest).success).toBe(false);
    },
  );
});

describe("mercadoPagoCancellationSchema", () => {
  it("accepts the state of a payment with whether it can only be cancelled on the terminal", () => {
    const cancellation = { ...payment, provider: "MERCADOPAGO_POINT", cancel_on_terminal: true };

    expect(mercadoPagoCancellationSchema.parse(cancellation)).toEqual(cancellation);
  });

  it("refuses an answer that does not say whether the cancellation is left to the terminal", () => {
    expect(mercadoPagoCancellationSchema.safeParse(payment).success).toBe(false);
  });

  it("refuses a cancellation that is not a boolean", () => {
    expect(
      mercadoPagoCancellationSchema.safeParse({ ...payment, cancel_on_terminal: "yes" }).success,
    ).toBe(false);
  });
});
