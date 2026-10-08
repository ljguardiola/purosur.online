import { type cashCharge, MAX_CASH_AMOUNT_CENTS } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  salesCoreToRendererMessageSchema,
  salesRendererToCoreMessageSchema,
} from "./core-messages.js";
import type { CashCharge } from "./sale.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

describe("salesRendererToCoreMessageSchema", () => {
  it("rejects any other message type", () => {
    expect(salesRendererToCoreMessageSchema.safeParse({ type: "health-check" }).success).toBe(
      false,
    );
    expect(salesRendererToCoreMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe("cancelling the open sale of a locked register", () => {
  const cancel = {
    type: "cancel-locked-sale",
    request_id: REQUEST_ID,
    closer: { user_id: "u2", pin: "1234" },
  };

  it("accepts a request carrying the closer's PIN", () => {
    expect(salesRendererToCoreMessageSchema.parse(cancel)).toEqual(cancel);
  });

  it.each(["request_id", "closer"])("rejects a request missing its %s", (field) => {
    const message = Object.fromEntries(Object.entries(cancel).filter(([key]) => key !== field));

    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a closer without a PIN", () => {
    const message = { ...cancel, closer: { user_id: "u2" } };

    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { kind: "cancelled" },
    { kind: "has_approved_payment" },
    { kind: "no_open_sale" },
    { kind: "no_open_session" },
    { kind: "not_locked" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "rate_limited", retry_after_seconds: 1, attempts_left: 2 },
  ])("accepts the result $kind", (outcome) => {
    const message = { type: "cancel-locked-sale-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([{ kind: "not_signed_in" }, { kind: "closed" }, { kind: "x" }])(
    "rejects a result it does not know: %j",
    (outcome) => {
      const message = { type: "cancel-locked-sale-result", request_id: REQUEST_ID, outcome };

      expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
    },
  );
});

describe("sale requests", () => {
  it("accepts a scan of a code", () => {
    const message = { type: "scan-product", request_id: REQUEST_ID, code: "7791234567890" };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is selling from the renderer", () => {
    const message = { type: "scan-product", request_id: REQUEST_ID, code: "1" };

    expect(salesRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });

  it.each([
    { type: "scan-product", code: "1" },
    { type: "scan-product", request_id: REQUEST_ID },
    { type: "scan-product", request_id: REQUEST_ID, code: "" },
  ])("rejects a scan that is not well formed: %j", (message) => {
    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("leaves a code longer than any barcode to the core", () => {
    const message = { type: "scan-product", request_id: REQUEST_ID, code: "7".repeat(65) };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("leaves a search longer than any product name to the core", () => {
    const message = { type: "search-products", request_id: REQUEST_ID, query: "x".repeat(101) };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("accepts a search of the products by name", () => {
    const message = { type: "search-products", request_id: REQUEST_ID, query: "té ver" };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "search-products", query: "a" },
    { type: "search-products", request_id: REQUEST_ID },
  ])("rejects a search that is not well formed: %j", (message) => {
    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts adding a product by its id", () => {
    const message = { type: "add-product", request_id: REQUEST_ID, product_id: "p1" };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is selling from the search or the addition", () => {
    const search = { type: "search-products", request_id: REQUEST_ID, query: "a" };
    const add = { type: "add-product", request_id: REQUEST_ID, product_id: "p1" };

    expect(salesRendererToCoreMessageSchema.parse({ ...search, user_id: "u9" })).toEqual(search);
    expect(salesRendererToCoreMessageSchema.parse({ ...add, user_id: "u9" })).toEqual(add);
  });

  it.each([
    { type: "add-product", product_id: "p1" },
    { type: "add-product", request_id: REQUEST_ID },
  ])("rejects an addition that is not well formed: %j", (message) => {
    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a request for the sale in progress", () => {
    const message = { type: "sale-request", request_id: REQUEST_ID };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is selling from the sale request either", () => {
    const message = { type: "sale-request", request_id: REQUEST_ID };

    expect(salesRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });

  it("rejects a request for the sale missing its request id", () => {
    expect(salesRendererToCoreMessageSchema.safeParse({ type: "sale-request" }).success).toBe(
      false,
    );
  });
});

describe("charge sale in cash request", () => {
  const message = {
    type: "charge-sale-in-cash",
    request_id: REQUEST_ID,
    sale_id: "s1",
    tendered: 5000,
  };

  it("accepts a charge of a sale with the amount tendered in cents", () => {
    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is charging from the renderer", () => {
    expect(salesRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });

  it.each([0, -100, MAX_CASH_AMOUNT_CENTS + 1])(
    "leaves the amount %s for the core to refuse as invalid",
    (tendered) => {
      expect(salesRendererToCoreMessageSchema.parse({ ...message, tendered })).toEqual({
        ...message,
        tendered,
      });
    },
  );

  it.each([
    ["request id", { ...message, request_id: undefined }],
    ["sale id", { ...message, sale_id: undefined }],
    ["tendered amount", { ...message, tendered: undefined }],
    ["whole number of cents", { ...message, tendered: 12.5 }],
    ["number", { ...message, tendered: "5000" }],
  ])("rejects a charge without a valid %s", (_case, value) => {
    expect(salesRendererToCoreMessageSchema.safeParse(value).success).toBe(false);
  });
});

describe("sale answers", () => {
  const sale = {
    id: "s1",
    lines: [
      {
        id: "l1",
        product_id: "p1",
        product_name: "Yerba",
        quantity: 1,
        list_unit_price: 1500,
        discount_amount: 0,
        promotion: null,
        line_total: 1500,
      },
    ],
    total: 1500,
    paid: 0,
    pending: 1500,
    lines_editable: true,
    cancellable: true,
    charge_refusal: null,
    refunds_on_cancel: [],
    cancel_authorization_required: false,
  };

  it.each([
    { kind: "added", sale },
    { kind: "unknown_code" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "sale_has_payments" },
    { kind: "not_signed_in" },
    { kind: "unavailable" },
  ])("accepts the scan result $kind", (outcome) => {
    const message = { type: "scan-product-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a scan result it does not know", () => {
    const message = {
      type: "scan-product-result",
      request_id: REQUEST_ID,
      outcome: { kind: "somewhere_else" },
    };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { kind: "results", products: [], more: false },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])("accepts the search result $kind", (outcome) => {
    const message = { type: "search-products-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "product_unavailable" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "sale_has_payments" },
    { kind: "not_signed_in" },
  ])("accepts the add-product result $kind", (outcome) => {
    const message = { type: "add-product-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects search and add-product results it does not know", () => {
    const outcome = { kind: "somewhere_else" };

    expect(
      salesCoreToRendererMessageSchema.safeParse({
        type: "search-products-result",
        request_id: REQUEST_ID,
        outcome,
      }).success,
    ).toBe(false);
    expect(
      salesCoreToRendererMessageSchema.safeParse({
        type: "add-product-result",
        request_id: REQUEST_ID,
        outcome,
      }).success,
    ).toBe(false);
  });

  it.each([sale, null])("accepts the sale in progress %j", (value) => {
    const message = { type: "sale", request_id: REQUEST_ID, sale: value };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects the sale in progress without saying whether there is one", () => {
    expect(
      salesCoreToRendererMessageSchema.safeParse({ type: "sale", request_id: REQUEST_ID }).success,
    ).toBe(false);
  });

  it("accepts that the sale in progress cannot be read", () => {
    const message = { type: "sale-unavailable", request_id: REQUEST_ID };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the sale in progress cannot be read without its request id", () => {
    expect(salesCoreToRendererMessageSchema.safeParse({ type: "sale-unavailable" }).success).toBe(
      false,
    );
  });

  it("accepts that the person signed in may not sell", () => {
    const message = { type: "sale-not-permitted", request_id: REQUEST_ID };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects that the person signed in may not sell without its request id", () => {
    expect(salesCoreToRendererMessageSchema.safeParse({ type: "sale-not-permitted" }).success).toBe(
      false,
    );
  });
});

describe("sale line requests", () => {
  it("accepts a change of a line's quantity", () => {
    const message = {
      type: "change-line-quantity",
      request_id: REQUEST_ID,
      line_id: "l1",
      quantity: 3,
      expected_quantity: 4,
    };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { line_id: "l1", quantity: 3 },
    { line_id: "l1", expected_quantity: 3 },
    { quantity: 3, expected_quantity: 3 },
    { line_id: "l1", quantity: 0, expected_quantity: 3 },
    { line_id: "l1", quantity: -1, expected_quantity: 3 },
    { line_id: "l1", quantity: 1.5, expected_quantity: 3 },
    { line_id: 7, quantity: 1, expected_quantity: 3 },
    { line_id: "l1", quantity: 1, expected_quantity: 0 },
    { line_id: "l1", quantity: 1, expected_quantity: -1 },
    { line_id: "l1", quantity: 1, expected_quantity: 1.5 },
    { line_id: "l1", quantity: 1, expected_quantity: "3" },
  ])("rejects a quantity change that is not well formed: %j", (fields) => {
    expect(
      salesRendererToCoreMessageSchema.safeParse({
        type: "change-line-quantity",
        request_id: REQUEST_ID,
        ...fields,
      }).success,
    ).toBe(false);
  });

  it("rejects a quantity change missing its request id", () => {
    expect(
      salesRendererToCoreMessageSchema.safeParse({
        type: "change-line-quantity",
        line_id: "l1",
        quantity: 1,
        expected_quantity: 2,
      }).success,
    ).toBe(false);
  });

  it("accepts the removal of a line", () => {
    const message = { type: "remove-sale-line", request_id: REQUEST_ID, line_id: "l1" };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { type: "remove-sale-line", request_id: REQUEST_ID },
    { type: "remove-sale-line", line_id: "l1" },
  ])("rejects a removal that is not well formed: %j", (message) => {
    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the cancellation of the sale", () => {
    const message = { type: "cancel-sale", request_id: REQUEST_ID };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a cancellation missing its request id", () => {
    expect(salesRendererToCoreMessageSchema.safeParse({ type: "cancel-sale" }).success).toBe(false);
  });

  it("does not take who is selling from any of them", () => {
    const cancel = { type: "cancel-sale", request_id: REQUEST_ID };

    expect(salesRendererToCoreMessageSchema.parse({ ...cancel, user_id: "u9" })).toEqual(cancel);
  });
});

describe("cancelling a sale with approved payments", () => {
  const cancel = { type: "cancel-paid-sale", request_id: REQUEST_ID, sale_id: "s1" };

  it("accepts the cancellation of a sale", () => {
    expect(salesRendererToCoreMessageSchema.parse(cancel)).toEqual(cancel);
  });

  it("accepts the cancellation authorized with another person's PIN", () => {
    const authorized = { ...cancel, authorization: { user_id: "u2", pin: "1234" } };

    expect(salesRendererToCoreMessageSchema.parse(authorized)).toEqual(authorized);
  });

  it.each([
    ["without its request id", { type: "cancel-paid-sale", sale_id: "s1" }],
    ["without the sale", { type: "cancel-paid-sale", request_id: REQUEST_ID }],
    ["with an authorization missing the PIN", { ...cancel, authorization: { user_id: "u2" } }],
  ])("rejects a cancellation %s", (_case, message) => {
    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the answer to the cancellation", () => {
    const message = {
      type: "cancel-paid-sale-result",
      request_id: REQUEST_ID,
      outcome: {
        kind: "cancelled",
        refunds: [{ payment_id: "p1", method: "CASH", amount: 1000, state: "APPROVED" }],
        authorized_by: null,
      },
    };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects an answer with an outcome it does not know", () => {
    expect(
      salesCoreToRendererMessageSchema.safeParse({
        type: "cancel-paid-sale-result",
        request_id: REQUEST_ID,
        outcome: { kind: "somewhere_else" },
      }).success,
    ).toBe(false);
  });
});

describe("sale line answers", () => {
  const sale = {
    id: "s1",
    lines: [],
    total: 0,
    paid: 0,
    pending: 0,
    lines_editable: true,
    cancellable: true,
    charge_refusal: null,
    refunds_on_cancel: [],
    cancel_authorization_required: false,
  };

  it.each([
    ["change-line-quantity-result", { kind: "changed", sale }],
    ["change-line-quantity-result", { kind: "unknown_line" }],
    ["change-line-quantity-result", { kind: "stale_quantity" }],
    ["change-line-quantity-result", { kind: "sale_has_payments" }],
    ["remove-sale-line-result", { kind: "removed", sale }],
    ["remove-sale-line-result", { kind: "no_open_sale" }],
    ["remove-sale-line-result", { kind: "sale_has_payments" }],
    ["cancel-sale-result", { kind: "cancelled" }],
    ["cancel-sale-result", { kind: "unavailable" }],
  ])("accepts %s with the outcome %j", (type, outcome) => {
    const message = { type, request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each(["change-line-quantity-result", "remove-sale-line-result", "cancel-sale-result"])(
    "rejects %s with an outcome it does not know",
    (type) => {
      expect(
        salesCoreToRendererMessageSchema.safeParse({
          type,
          request_id: REQUEST_ID,
          outcome: { kind: "somewhere_else" },
        }).success,
      ).toBe(false);
    },
  );

  it.each(["change-line-quantity-result", "remove-sale-line-result", "cancel-sale-result"])(
    "rejects %s without its request id",
    (type) => {
      expect(
        salesCoreToRendererMessageSchema.safeParse({ type, outcome: { kind: "unavailable" } })
          .success,
      ).toBe(false);
    },
  );
});

describe("charge sale in cash answer", () => {
  it.each([
    { kind: "completed", sale_id: "s1", total: 3000, tendered: 5000, change: 2000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000, pending: 2000 },
    { kind: "reaches_buyer_identification_threshold", threshold: 10_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "not_signed_in" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const message = { type: "charge-sale-in-cash-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a result it does not know", () => {
    const message = {
      type: "charge-sale-in-cash-result",
      request_id: REQUEST_ID,
      outcome: { kind: "somewhere_else" },
    };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a result without its request id", () => {
    const message = { type: "charge-sale-in-cash-result", outcome: { kind: "empty_sale" } };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("charge sale by transfer request", () => {
  const message = {
    type: "charge-sale-by-transfer",
    request_id: REQUEST_ID,
    sale_id: "s1",
    amount: 2000,
  };

  it("accepts a charge of an amount of a sale", () => {
    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("does not take who is charging or a tendered amount from the renderer", () => {
    expect(
      salesRendererToCoreMessageSchema.parse({ ...message, user_id: "u9", tendered: 5000 }),
    ).toEqual(message);
  });

  it.each([0, -100])("leaves the amount %s for the core to refuse as invalid", (amount) => {
    expect(salesRendererToCoreMessageSchema.parse({ ...message, amount })).toEqual({
      ...message,
      amount,
    });
  });

  it.each([
    ["request id", { ...message, request_id: undefined }],
    ["sale id", { ...message, sale_id: undefined }],
    ["sale id as text", { ...message, sale_id: 7 }],
    ["amount", { ...message, amount: undefined }],
    ["whole number of cents", { ...message, amount: 12.5 }],
    ["number", { ...message, amount: "2000" }],
  ])("rejects a charge without a valid %s", (_case, value) => {
    expect(salesRendererToCoreMessageSchema.safeParse(value).success).toBe(false);
  });
});

describe("charge sale by transfer answer", () => {
  it.each([
    { kind: "completed", sale_id: "s1", total: 3000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000, pending: 2000 },
    { kind: "invalid_amount" },
    { kind: "exceeds_pending", pending: 2000 },
    { kind: "empty_sale" },
    { kind: "not_signed_in" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const message = { type: "charge-sale-by-transfer-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects a result it does not know", () => {
    const message = {
      type: "charge-sale-by-transfer-result",
      request_id: REQUEST_ID,
      outcome: { kind: "insufficient_cash", amount_due: 3000 },
    };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a result without its request id", () => {
    const message = { type: "charge-sale-by-transfer-result", outcome: { kind: "empty_sale" } };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("cash charge request", () => {
  const message = {
    type: "cash-charge-request",
    request_id: REQUEST_ID,
    sale_id: "s1",
    tendered: 5000,
  };

  it("accepts a request for what a sale needs when an amount in cents is tendered", () => {
    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ["without its request id", { ...message, request_id: undefined }],
    ["without the sale", { ...message, sale_id: undefined }],
    ["with an amount that is not whole cents", { ...message, tendered: 50.5 }],
  ])("rejects a request %s", (_case, invalid) => {
    expect(salesRendererToCoreMessageSchema.safeParse(invalid).success).toBe(false);
  });

  it("does not take who is selling from the request", () => {
    expect(salesRendererToCoreMessageSchema.parse({ ...message, user_id: "u9" })).toEqual(message);
  });
});

describe("cash charge answers", () => {
  it.each([
    [{ kind: "invalid_amount" }],
    [{ kind: "partial", applied: 1000, pending: 2000 }],
    [{ kind: "covered", applied: 3000, change: 2000 }],
    [null],
  ])("accepts the answer %j", (charge) => {
    const message = { type: "cash-charge", request_id: REQUEST_ID, charge };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    [{ kind: "covered", applied: 3000 }],
    [{ kind: "partial", applied: 1000 }],
    [{ kind: "partial", applied: "1000", pending: 2000 }],
    [{ kind: "insufficient", amountDue: 3000 }],
    [{ kind: "unknown" }],
  ])("rejects the answer %j", (charge) => {
    expect(
      salesCoreToRendererMessageSchema.safeParse({
        type: "cash-charge",
        request_id: REQUEST_ID,
        charge,
      }).success,
    ).toBe(false);
  });

  it.each(["cash-charge-unavailable", "cash-charge-not-permitted"])(
    "accepts %s and rejects it without its request id",
    (type) => {
      const message = { type, request_id: REQUEST_ID };

      expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
      expect(salesCoreToRendererMessageSchema.safeParse({ type }).success).toBe(false);
    },
  );

  it("describes a charge as the domain does", () => {
    expectTypeOf<CashCharge>().toEqualTypeOf<ReturnType<typeof cashCharge>>();
  });
});
