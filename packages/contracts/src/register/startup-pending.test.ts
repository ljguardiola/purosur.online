import { describe, expect, it } from "vitest";
import { startupPendingSchema } from "./startup-pending.js";

const SALE_TO_PRINT = {
  sale_id: "sale-1",
  completed_at: "2026-10-13T12:00:00.000Z",
  total: 345000,
  standing: "never_printed",
};

const UNKNOWN_FISCAL_DOCUMENT = {
  id: "document-1",
  sale_id: "sale-2",
  completed_at: "2026-10-13T12:05:00.000Z",
  total: 120000,
};

const PENDING_PAYMENT = {
  payment_id: "payment-1",
  sale_id: "sale-3",
  method: "QR",
  amount: 50000,
  occurred_at: "2026-10-13T12:10:00.000Z",
};

const PAID_ORDER_WITHOUT_SALE = {
  payment_transaction_id: "payment-2",
  sale_id: "sale-4",
  method: "POINT",
  amount: 75000,
  created_at: "2026-10-13T11:00:00.000Z",
};

const PENDING = {
  sales_to_print: [SALE_TO_PRINT],
  unknown_fiscal_documents: [UNKNOWN_FISCAL_DOCUMENT],
  pending_payments: [PENDING_PAYMENT],
  paid_orders_without_sale: [PAID_ORDER_WITHOUT_SALE],
  paid_order_discovery: "checked",
  selling_blocked: true,
  may_go_selling: false,
};

describe("startupPendingSchema", () => {
  it("accepts what a stopped register left pending", () => {
    expect(startupPendingSchema.parse(PENDING)).toEqual(PENDING);
  });

  it("accepts a register that left nothing pending", () => {
    const nothing = {
      sales_to_print: [],
      unknown_fiscal_documents: [],
      pending_payments: [],
      paid_orders_without_sale: [],
      paid_order_discovery: "checked",
      selling_blocked: false,
      may_go_selling: true,
    };

    expect(startupPendingSchema.parse(nothing)).toEqual(nothing);
  });

  it.each(["never_printed", "outcome_unknown"])("accepts a sale to print as %s", (standing) => {
    expect(
      startupPendingSchema.safeParse({
        ...PENDING,
        sales_to_print: [{ ...SALE_TO_PRINT, standing }],
      }).success,
    ).toBe(true);
  });

  it.each(["QR", "POINT"])("accepts a pending payment by %s", (method) => {
    expect(
      startupPendingSchema.safeParse({
        ...PENDING,
        pending_payments: [{ ...PENDING_PAYMENT, method }],
      }).success,
    ).toBe(true);
  });

  it.each(["pending", "deferred", "checked"])("accepts the paid-order check being %s", (state) => {
    expect(
      startupPendingSchema.safeParse({ ...PENDING, paid_order_discovery: state }).success,
    ).toBe(true);
  });

  it.each(["QR", "POINT"])("accepts a paid order without a sale paid by %s", (method) => {
    expect(
      startupPendingSchema.safeParse({
        ...PENDING,
        paid_orders_without_sale: [{ ...PAID_ORDER_WITHOUT_SALE, method }],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a list of paid orders without a sale", { ...PENDING, paid_orders_without_sale: undefined }],
    ["the state of the paid-order check", { ...PENDING, paid_order_discovery: undefined }],
    ["whether selling is blocked", { ...PENDING, selling_blocked: undefined }],
    ["whether the cashier may go selling", { ...PENDING, may_go_selling: undefined }],
    [
      "the payment of a paid order without a sale",
      {
        ...PENDING,
        paid_orders_without_sale: [
          { ...PAID_ORDER_WITHOUT_SALE, payment_transaction_id: undefined },
        ],
      },
    ],
    [
      "the sale of a paid order without a sale",
      {
        ...PENDING,
        paid_orders_without_sale: [{ ...PAID_ORDER_WITHOUT_SALE, sale_id: undefined }],
      },
    ],
    [
      "the method of a paid order without a sale",
      {
        ...PENDING,
        paid_orders_without_sale: [{ ...PAID_ORDER_WITHOUT_SALE, method: undefined }],
      },
    ],
    [
      "the amount of a paid order without a sale",
      {
        ...PENDING,
        paid_orders_without_sale: [{ ...PAID_ORDER_WITHOUT_SALE, amount: undefined }],
      },
    ],
    [
      "the time of a paid order without a sale",
      {
        ...PENDING,
        paid_orders_without_sale: [{ ...PAID_ORDER_WITHOUT_SALE, created_at: undefined }],
      },
    ],
  ])("rejects it without %s", (_field, pending) => {
    expect(startupPendingSchema.safeParse(pending).success).toBe(false);
  });

  it.each([
    ["a paid order paid by cash", { ...PAID_ORDER_WITHOUT_SALE, method: "CASH" }],
    ["a paid order of nothing", { ...PAID_ORDER_WITHOUT_SALE, amount: 0 }],
    [
      "a paid order of an amount that is not a whole number",
      { ...PAID_ORDER_WITHOUT_SALE, amount: 1.5 },
    ],
  ])("rejects %s", (_name, paidOrder) => {
    expect(
      startupPendingSchema.safeParse({ ...PENDING, paid_orders_without_sale: [paidOrder] }).success,
    ).toBe(false);
  });

  it("rejects a state of the paid-order check it does not know", () => {
    expect(
      startupPendingSchema.safeParse({ ...PENDING, paid_order_discovery: "skipped" }).success,
    ).toBe(false);
  });

  it.each([
    ["a list of sales to print", { ...PENDING, sales_to_print: undefined }],
    ["a list of unknown fiscal documents", { ...PENDING, unknown_fiscal_documents: undefined }],
    ["a list of pending payments", { ...PENDING, pending_payments: undefined }],
    [
      "the id of a sale to print",
      { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, sale_id: undefined }] },
    ],
    [
      "the time of a sale to print",
      { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, completed_at: undefined }] },
    ],
    [
      "the total of a sale to print",
      { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, total: undefined }] },
    ],
    [
      "the standing of a sale to print",
      { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, standing: undefined }] },
    ],
    [
      "the id of a fiscal document",
      { ...PENDING, unknown_fiscal_documents: [{ ...UNKNOWN_FISCAL_DOCUMENT, id: undefined }] },
    ],
    [
      "the sale of a fiscal document",
      {
        ...PENDING,
        unknown_fiscal_documents: [{ ...UNKNOWN_FISCAL_DOCUMENT, sale_id: undefined }],
      },
    ],
    [
      "the time of a fiscal document's sale",
      {
        ...PENDING,
        unknown_fiscal_documents: [{ ...UNKNOWN_FISCAL_DOCUMENT, completed_at: undefined }],
      },
    ],
    [
      "the total of a fiscal document's sale",
      { ...PENDING, unknown_fiscal_documents: [{ ...UNKNOWN_FISCAL_DOCUMENT, total: undefined }] },
    ],
    [
      "the id of a pending payment",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, payment_id: undefined }] },
    ],
    [
      "the sale of a pending payment",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, sale_id: undefined }] },
    ],
    [
      "the method of a pending payment",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, method: undefined }] },
    ],
    [
      "the amount of a pending payment",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, amount: undefined }] },
    ],
    [
      "the time of a pending payment",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, occurred_at: undefined }] },
    ],
  ])("rejects it without %s", (_field, pending) => {
    expect(startupPendingSchema.safeParse(pending).success).toBe(false);
  });

  it.each([
    [
      "a sale to print already printed",
      { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, standing: "printed" }] },
    ],
    [
      "a total that is not a whole number",
      { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, total: 10.5 }] },
    ],
    ["a negative total", { ...PENDING, sales_to_print: [{ ...SALE_TO_PRINT, total: -1 }] }],
    [
      "a fiscal document's sale with a total that is not a whole number",
      { ...PENDING, unknown_fiscal_documents: [{ ...UNKNOWN_FISCAL_DOCUMENT, total: 1.5 }] },
    ],
    [
      "a payment by cash",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, method: "CASH" }] },
    ],
    ["a payment of nothing", { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, amount: 0 }] }],
    [
      "a payment with an amount that is not a whole number",
      { ...PENDING, pending_payments: [{ ...PENDING_PAYMENT, amount: 1.5 }] },
    ],
  ])("rejects %s", (_name, pending) => {
    expect(startupPendingSchema.safeParse(pending).success).toBe(false);
  });
});
