import { describe, expect, it } from "vitest";
import {
  approvedOrdersOfRegisterSchema,
  latePaymentRefundOpeningSchema,
  latePaymentRefundRefusalDetailSchema,
} from "./paid-orders-of-register.js";

const TRANSACTION_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";
const SALE_ID = "9d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const order: Record<string, unknown> = {
  payment_transaction_id: TRANSACTION_ID,
  sale_id: SALE_ID,
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: 2500,
  created_at: "2026-10-13T11:00:00.000Z",
};

describe("approvedOrdersOfRegisterSchema", () => {
  it("accepts a list of orders and an empty list", () => {
    const body = { orders: [order, { ...order, method: "POINT", provider: "MERCADOPAGO_POINT" }] };

    expect(approvedOrdersOfRegisterSchema.parse(body)).toEqual(body);
    expect(approvedOrdersOfRegisterSchema.parse({ orders: [] })).toEqual({ orders: [] });
  });

  it.each([
    ["a payment transaction id that is not a record id", { payment_transaction_id: "no" }],
    ["a sale id that is not a record id", { sale_id: "no" }],
    ["a method no order is paid with", { method: "CASH" }],
    ["a provider no order is paid with", { provider: "NONE" }],
    ["a zero amount", { amount: 0 }],
    ["a fractional amount", { amount: 10.5 }],
    ["a creation that is not an instant", { created_at: "yesterday" }],
  ])("refuses %s", (_name, overrides) => {
    expect(
      approvedOrdersOfRegisterSchema.safeParse({ orders: [{ ...order, ...overrides }] }).success,
    ).toBe(false);
  });

  it.each(["payment_transaction_id", "sale_id", "method", "provider", "amount", "created_at"])(
    "refuses an order without %s",
    (field) => {
      const { [field]: _removed, ...incomplete } = order;

      expect(approvedOrdersOfRegisterSchema.safeParse({ orders: [incomplete] }).success).toBe(
        false,
      );
    },
  );

  it("refuses a body without the orders", () => {
    expect(approvedOrdersOfRegisterSchema.safeParse({}).success).toBe(false);
  });
});

describe("latePaymentRefundOpeningSchema", () => {
  it.each(["opened", "already_open"])("accepts the opening %s", (opening) => {
    const body = { payment_transaction_id: TRANSACTION_ID, opening };

    expect(latePaymentRefundOpeningSchema.parse(body)).toEqual(body);
  });

  it("refuses an opening nothing defines and a payment that is not a record id", () => {
    expect(
      latePaymentRefundOpeningSchema.safeParse({
        payment_transaction_id: TRANSACTION_ID,
        opening: "closed",
      }).success,
    ).toBe(false);
    expect(
      latePaymentRefundOpeningSchema.safeParse({ payment_transaction_id: "no", opening: "opened" })
        .success,
    ).toBe(false);
    expect(latePaymentRefundOpeningSchema.safeParse({ opening: "opened" }).success).toBe(false);
  });
});

describe("latePaymentRefundRefusalDetailSchema", () => {
  it.each(["not_approved", "replaced"])("accepts the refusal %s", (refusal) => {
    expect(latePaymentRefundRefusalDetailSchema.parse({ refusal })).toEqual({ refusal });
  });

  it("refuses a reason nothing defines", () => {
    expect(latePaymentRefundRefusalDetailSchema.safeParse({ refusal: "other" }).success).toBe(
      false,
    );
  });
});
