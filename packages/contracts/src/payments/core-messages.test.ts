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
    type: "start-mercado-pago-charge",
    request_id: REQUEST_ID,
    sale_id: "s1",
    method: "QR",
    amount: 2000,
  };

  it("accepts a charge of an amount of a sale", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["DEBIT", "CREDIT"])(
    "accepts a %s card charge on the integrated terminal",
    (card_type) => {
      const onTheTerminal = { ...message, method: "POINT", card_type };

      expect(paymentsRendererToCoreMessageSchema.parse(onTheTerminal)).toEqual(onTheTerminal);
    },
  );

  it.each([undefined, "QR", "CARD", "debit", null])(
    "rejects a charge on the integrated terminal with the card type %s",
    (card_type) => {
      expect(
        paymentsRendererToCoreMessageSchema.safeParse({ ...message, method: "POINT", card_type })
          .success,
      ).toBe(false);
    },
  );

  it("takes no card type for a QR charge", () => {
    expect(paymentsRendererToCoreMessageSchema.parse({ ...message, card_type: "DEBIT" })).toEqual(
      message,
    );
  });

  it.each([undefined, "CASH", "TRANSFER", "MERCADOPAGO_POINT", "point"])(
    "rejects a charge by the method %s",
    (method) => {
      expect(paymentsRendererToCoreMessageSchema.safeParse({ ...message, method }).success).toBe(
        false,
      );
    },
  );

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
      wait_seconds: 180,
    },
    {
      kind: "order_shown",
      payment_transaction_id: PAYMENT_ID,
      amount: 2000,
      remaining_seconds: 0,
      wait_seconds: 180,
    },
    {
      kind: "order_shown",
      payment_transaction_id: PAYMENT_ID,
      amount: 2000,
      remaining_seconds: 0,
      wait_seconds: 0,
    },
    {
      kind: "order_unconfirmed",
      payment_transaction_id: PAYMENT_ID,
      amount: 2000,
      remaining_seconds: 180,
      wait_seconds: 180,
    },
    { kind: "order_refused" },
    { kind: "unreachable" },
    { kind: "mercado_pago_charge_in_progress" },
    { kind: "invalid_amount" },
    { kind: "below_minimum" },
    { kind: "not_configured" },
    { kind: "exceeds_pending", pending: 1500 },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "restoration_in_progress" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = { type: "start-mercado-pago-charge-result", request_id: REQUEST_ID, outcome };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([
    ["a negative wait", -1],
    ["a wait in part of a second", 1.5],
  ])("rejects an order shown with %s", (_case, remaining_seconds) => {
    const result = {
      type: "start-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "order_shown",
        payment_transaction_id: PAYMENT_ID,
        amount: 2000,
        remaining_seconds,
        wait_seconds: 180,
      },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });

  it("accepts an order shown with more than the wait left, since it ends at the order's expiry", () => {
    const result = {
      type: "start-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "order_shown",
        payment_transaction_id: PAYMENT_ID,
        amount: 2000,
        remaining_seconds: 190,
        wait_seconds: 180,
      },
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it("rejects an order shown for no amount", () => {
    const result = {
      type: "start-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "order_shown",
        payment_transaction_id: PAYMENT_ID,
        amount: 0,
        remaining_seconds: 180,
        wait_seconds: 180,
      },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });

  it.each([
    ["without the full wait", undefined],
    ["with a negative full wait", -1],
    ["with a full wait in part of a second", 1.5],
  ])("rejects an order shown %s", (_case, wait_seconds) => {
    const result = {
      type: "start-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "order_shown",
        payment_transaction_id: PAYMENT_ID,
        amount: 2000,
        remaining_seconds: 100,
        wait_seconds,
      },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });
});

describe("following a Mercado Pago QR charge", () => {
  const message = {
    type: "follow-mercado-pago-charge",
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
    { kind: "waiting", remaining_seconds: 0 },
    { kind: "waiting", remaining_seconds: 190 },
    { kind: "wait_over" },
    { kind: "at_terminal_wait_over" },
    { kind: "closed" },
    { kind: "expired" },
    { kind: "expiry_unconfirmed" },
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
    { kind: "restoration_in_progress" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = {
      type: "follow-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome,
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([-1, 2.5])("rejects a wait with %s seconds left", (remaining_seconds) => {
    const result = {
      type: "follow-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome: { kind: "waiting", remaining_seconds },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });

  it("rejects a result without its request id", () => {
    const result = { type: "follow-mercado-pago-charge-result", outcome: { kind: "declined" } };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });
});

describe("abandoning a Mercado Pago QR charge", () => {
  const message = {
    type: "abandon-mercado-pago-charge",
    request_id: REQUEST_ID,
    payment_transaction_id: PAYMENT_ID,
  };

  it("accepts a request naming the payment being abandoned", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request without the payment or its request id", () => {
    expect(
      paymentsRendererToCoreMessageSchema.safeParse({
        ...message,
        payment_transaction_id: undefined,
      }).success,
    ).toBe(false);
    expect(
      paymentsRendererToCoreMessageSchema.safeParse({ ...message, request_id: undefined }).success,
    ).toBe(false);
  });

  it.each([
    { kind: "cancelled" },
    { kind: "closed" },
    { kind: "replaced" },
    { kind: "cancel_on_terminal" },
    { kind: "unreachable" },
    { kind: "not_pending" },
    { kind: "already_paid", settlement: { kind: "completed", sale_id: "s1", total: 3000 } },
    {
      kind: "already_paid",
      settlement: { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 2000, pending: 1000 },
    },
    { kind: "already_paid", settlement: { kind: "no_open_sale" } },
    { kind: "already_paid", settlement: { kind: "not_pending" } },
    { kind: "already_paid", settlement: { kind: "unavailable" } },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "restoration_in_progress" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = {
      type: "abandon-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome,
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([
    { kind: "already_paid" },
    { kind: "already_paid", settlement: { kind: "replaced" } },
    { kind: "already_paid", settlement: { kind: "completed", sale_id: "s1" } },
    { kind: "waiting", remaining_seconds: 10 },
    { kind: "expired" },
    { kind: "completed", sale_id: "s1", total: 3000 },
  ])("rejects the result %j", (outcome) => {
    const result = {
      type: "abandon-mercado-pago-charge-result",
      request_id: REQUEST_ID,
      outcome,
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });

  it("rejects a result without its request id", () => {
    const result = {
      type: "abandon-mercado-pago-charge-result",
      outcome: { kind: "cancelled" },
    };

    expect(paymentsCoreToRendererMessageSchema.safeParse(result).success).toBe(false);
  });
});

describe("asking which payment methods are available", () => {
  const message = { type: "payment-method-availability", request_id: REQUEST_ID };

  it("accepts a request carrying only its id", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a request without its id", () => {
    expect(
      paymentsRendererToCoreMessageSchema.safeParse({ ...message, request_id: undefined }).success,
    ).toBe(false);
  });

  it.each([
    { qr: "available", point: "available", point_minimum: 1500 },
    { qr: "offline", point: "offline", point_minimum: 1500 },
    { qr: "available", point: "below_minimum", point_minimum: 1500 },
    { qr: "not_configured", point: "available", point_minimum: 1500 },
    null,
  ])("accepts the answer %o", (availability) => {
    const result = {
      type: "payment-method-availability-result",
      request_id: REQUEST_ID,
      availability,
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([
    { qr: "below_minimum", point: "available", point_minimum: 1500 },
    { qr: "available", point: "unknown", point_minimum: 1500 },
    { qr: "available", point_minimum: 1500 },
    { point: "available", point_minimum: 1500 },
    { qr: "available", point: "available" },
  ])("rejects the answer %o", (availability) => {
    expect(
      paymentsCoreToRendererMessageSchema.safeParse({
        type: "payment-method-availability-result",
        request_id: REQUEST_ID,
        availability,
      }).success,
    ).toBe(false);
  });
});

describe("converting a paid order without a sale into a refund", () => {
  const message = {
    type: "convert-paid-order-into-refund",
    request_id: REQUEST_ID,
    payment_transaction_id: PAYMENT_ID,
  };

  it("accepts the paid order to convert", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is converting from the renderer", () => {
    expect(paymentsRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(
      message,
    );
  });

  it.each([
    ["request id", { ...message, request_id: undefined }],
    ["payment", { ...message, payment_transaction_id: undefined }],
  ])("rejects a conversion without a %s", (_case, value) => {
    expect(paymentsRendererToCoreMessageSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    "converted",
    "already_resolved",
    "not_found",
    "rebuilt_sale_open",
    "refused",
    "unreachable",
    "not_permitted",
    "not_signed_in",
    "unavailable",
  ])("accepts the result %s", (kind) => {
    const result = {
      type: "convert-paid-order-into-refund-result",
      request_id: REQUEST_ID,
      outcome: { kind },
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it("rejects a result of another kind", () => {
    expect(
      paymentsCoreToRendererMessageSchema.safeParse({
        type: "convert-paid-order-into-refund-result",
        request_id: REQUEST_ID,
        outcome: { kind: "refunded" },
      }).success,
    ).toBe(false);
  });
});

describe("rebuilding a sale against a paid order", () => {
  const message = {
    type: "rebuild-sale-against-paid-order",
    request_id: REQUEST_ID,
    payment_transaction_id: PAYMENT_ID,
  };

  it("accepts the paid order to rebuild the sale against", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is rebuilding from the renderer", () => {
    expect(paymentsRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(
      message,
    );
  });

  it.each([
    ["request id", { ...message, request_id: undefined }],
    ["payment", { ...message, payment_transaction_id: undefined }],
  ])("rejects a rebuild without a %s", (_case, value) => {
    expect(paymentsRendererToCoreMessageSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    { kind: "rebuilt", sale_id: "sale-9" },
    { kind: "already_open", sale_id: "sale-9" },
    { kind: "not_found" },
    { kind: "already_resolved" },
    { kind: "another_sale_open" },
    { kind: "card_type_unknown" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "restoration_in_progress" },
    { kind: "installation_revoked" },
    { kind: "local_database_damaged" },
    { kind: "battery_critical" },
    { kind: "disk_space_short" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = {
      type: "rebuild-sale-against-paid-order-result",
      request_id: REQUEST_ID,
      outcome,
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([{ kind: "rebuilt" }, { kind: "already_open" }, { kind: "refunded" }])(
    "rejects the result %o",
    (outcome) => {
      expect(
        paymentsCoreToRendererMessageSchema.safeParse({
          type: "rebuild-sale-against-paid-order-result",
          request_id: REQUEST_ID,
          outcome,
        }).success,
      ).toBe(false);
    },
  );
});

describe("charging a sale with the paid order it was rebuilt against", () => {
  const message = {
    type: "charge-sale-with-paid-order",
    request_id: REQUEST_ID,
    sale_id: "sale-9",
  };

  it("accepts the sale to charge", () => {
    expect(paymentsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a charge without a sale", () => {
    expect(
      paymentsRendererToCoreMessageSchema.safeParse({ ...message, sale_id: undefined }).success,
    ).toBe(false);
  });

  it.each([
    { kind: "completed", sale_id: "sale-9", total: 6750, applied: 4500, surplus: 0 },
    { kind: "completed", sale_id: "sale-9", total: 2000, applied: 2000, surplus: 2500 },
    { kind: "partially_paid", sale_id: "sale-9", total: 6750, paid: 4500, pending: 2250 },
    { kind: "no_paid_order" },
    { kind: "already_applied" },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 10_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "restoration_in_progress" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const result = {
      type: "charge-sale-with-paid-order-result",
      request_id: REQUEST_ID,
      outcome,
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });

  it.each([
    ["no applied amount", { kind: "completed", sale_id: "sale-9", total: 6750, surplus: 0 }],
    ["no surplus", { kind: "completed", sale_id: "sale-9", total: 6750, applied: 4500 }],
    [
      "a negative surplus",
      { kind: "completed", sale_id: "sale-9", total: 6750, applied: 4500, surplus: -1 },
    ],
  ])("rejects a completion with %s", (_case, outcome) => {
    expect(
      paymentsCoreToRendererMessageSchema.safeParse({
        type: "charge-sale-with-paid-order-result",
        request_id: REQUEST_ID,
        outcome,
      }).success,
    ).toBe(false);
  });
});

describe("a Mercado Pago charge refused until the paid order is applied", () => {
  it.each([
    "start-mercado-pago-charge-result",
    "follow-mercado-pago-charge-result",
    "abandon-mercado-pago-charge-result",
  ])("is a possible outcome of %s", (type) => {
    const result = {
      type,
      request_id: REQUEST_ID,
      outcome: { kind: "paid_order_not_applied" },
    };

    expect(paymentsCoreToRendererMessageSchema.parse(result)).toEqual(result);
  });
});
