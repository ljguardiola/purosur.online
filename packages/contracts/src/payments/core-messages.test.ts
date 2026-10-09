import { describe, expect, it } from "vitest";
import {
  paymentsCoreToRendererMessageSchema,
  paymentsRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";

describe("paymentsRendererToCoreMessageSchema", () => {
  it("rejects any other message type", () => {
    expect(paymentsRendererToCoreMessageSchema.safeParse({ type: "sale-request" }).success).toBe(
      false,
    );
  });
});

describe("starting a Mercado Pago QR charge", () => {
  const message = {
    type: "start-mercado-pago-qr-charge",
    request_id: REQUEST_ID,
    sale_id: "s1",
    amount: 2000,
  };

  it("accepts a charge of an amount of a sale", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is charging from the renderer", () => {
    expect(paymentsRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(
      message,
    );
  });

  it.each([0, -100])("leaves the amount %s for the core to refuse as invalid", (amount) => {
    expect(paymentsRendererToCoreMessageSchema.parse({ ...message, amount })).toEqual({
      ...message,
      amount,
    });
  });

  it.each([
    ["request id", { ...message, request_id: undefined }],
    ["sale id", { ...message, sale_id: undefined }],
    ["amount", { ...message, amount: undefined }],
    ["whole number of cents", { ...message, amount: 12.5 }],
  ])("rejects a charge without a valid %s", (_case, value) => {
    expect(paymentsRendererToCoreMessageSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    {
      kind: "order_shown",
      payment_transaction_id: PAYMENT_ID,
      amount: 2000,
      remaining_seconds: 180,
    },
    { kind: "order_shown", payment_transaction_id: PAYMENT_ID, amount: 2000, remaining_seconds: 0 },
    { kind: "order_refused" },
    { kind: "unreachable" },
    { kind: "invalid_amount" },
    { kind: "exceeds_pending", pending: 1500 },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = { type: "start-mercado-pago-qr-charge-result", request_id: REQUEST_ID, outcome };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([
    ["a wait longer than 3 minutes", 181],
    ["a negative wait", -1],
    ["a wait in part of a second", 1.5],
  ])("rejects an order shown with %s", (_case, remaining_seconds) => {
    const result = {
      type: "start-mercado-pago-qr-charge-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "order_shown",
        payment_transaction_id: PAYMENT_ID,
        amount: 2000,
        remaining_seconds,
      },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });

  it("rejects an order shown for no amount", () => {
    const result = {
      type: "start-mercado-pago-qr-charge-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "order_shown",
        payment_transaction_id: PAYMENT_ID,
        amount: 0,
        remaining_seconds: 180,
      },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });
});

describe("following a Mercado Pago QR charge", () => {
  const message = {
    type: "follow-mercado-pago-qr-charge",
    request_id: REQUEST_ID,
    payment_transaction_id: PAYMENT_ID,
  };

  it("accepts a request naming the payment being charged", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request without the payment", () => {
    expect(
      paymentsRendererToCoreMessageSchema.safeParse({
        ...message,
        payment_transaction_id: undefined,
      }).success,
    ).toBe(false);
  });

  it.each([
    { kind: "waiting", remaining_seconds: 161 },
    { kind: "wait_over" },
    { kind: "declined" },
    { kind: "not_pending" },
    { kind: "completed", sale_id: "s1", total: 3000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 2000, pending: 1000 },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = {
      type: "follow-mercado-pago-qr-charge-result",
      request_id: REQUEST_ID,
      outcome,
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([0, 181, 2.5])("rejects a wait with %s seconds left", (remaining_seconds) => {
    const result = {
      type: "follow-mercado-pago-qr-charge-result",
      request_id: REQUEST_ID,
      outcome: { kind: "waiting", remaining_seconds },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });

  it("rejects a result without its request id", () => {
    const result = { type: "follow-mercado-pago-qr-charge-result", outcome: { kind: "declined" } };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });
});
