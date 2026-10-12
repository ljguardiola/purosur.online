import {
  MAX_UNIT_PRICE_CENTS,
  PIN_SIGN_IN_LOCKOUT_FAILURES,
  SEARCH_RESULT_LIMIT,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  addProductOutcomeSchema,
  addWeighedProductOutcomeSchema,
  adjustSaleLineOutcomeSchema,
  applySaleDiscountOutcomeSchema,
  cancelPaidSaleOutcomeSchema,
  cancelSaleOutcomeSchema,
  changeLineQuantityOutcomeSchema,
  changeLineWeightOutcomeSchema,
  chargeSaleByTransferOutcomeSchema,
  chargeSaleInCashOutcomeSchema,
  previewSaleDiscountOutcomeSchema,
  removeSaleLineOutcomeSchema,
  saleSchema,
  scanProductOutcomeSchema,
  searchProductsOutcomeSchema,
  weighProductOutcomeSchema,
} from "./sale.js";

const line = {
  id: "l1",
  product_id: "p1",
  product_name: "Yerba",
  sale_unit: "UNIT",
  weight_source: null,
  quantity: 2,
  list_unit_price: 1500,
  discount_amount: 0,
  promotion: null,
  manual_adjustment: null,
  line_total: 3000,
};
const sale = {
  id: "s1",
  lines: [line],
  total: 3000,
  paid: 1000,
  pending: 2000,
  lines_lock: "approved_payment",
  cancel_refusal: null,
  charge_refusal: null,
  refunds_on_cancel: [],
  cancel_authorization_required: false,
  adjust_authorization_required: false,
  sale_discount_authorization_required: false,
  subtotal: 3000,
  sale_discount: null,
};

describe("saleSchema", () => {
  it.each([
    ["scale", "SCALE"],
    ["typed entry", "MANUAL"],
  ] as const)(
    "accepts a line sold by the kilogram whose weight came from the %s",
    (_case, weight_source) => {
      const weighed = { ...line, sale_unit: "KG", weight_source, quantity: 1250, line_total: 1875 };

      expect(saleSchema.parse({ ...sale, lines: [weighed] }).lines).toEqual([weighed]);
    },
  );

  it.each([
    ["without its sale unit", { ...line, sale_unit: undefined }],
    ["without its weight source", { ...line, weight_source: undefined }],
    ["with an unknown sale unit", { ...line, sale_unit: "LITER" }],
    ["with an unknown weight source", { ...line, weight_source: "SENSOR" }],
  ])("rejects a line %s", (_case, value) => {
    expect(saleSchema.safeParse({ ...sale, lines: [value] }).success).toBe(false);
  });

  it("accepts a sale with its lines and the total to charge", () => {
    expect(saleSchema.parse(sale)).toEqual(sale);
  });

  it.each([
    ["a percent promotion", { kind: "PERCENT_OFF", percent: 15 }],
    ["a buy N pay M promotion", { kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 }],
  ])("accepts a line with %s and what it discounted", (_case, promotion) => {
    const promoted = { ...line, discount_amount: 450, promotion, line_total: 2550 };

    expect(saleSchema.parse({ ...sale, lines: [promoted] }).lines).toEqual([promoted]);
  });

  it.each([null, "approved_payment", "qr_charge_in_progress"] as const)(
    "accepts a sale whose lines are locked by %s",
    (lines_lock) => {
      expect(saleSchema.parse({ ...sale, lines_lock }).lines_lock).toBe(lines_lock);
    },
  );

  it.each([null, "qr_charge_in_progress", "holds_qr_payment"] as const)(
    "accepts a sale whose cancellation is refused by %s",
    (cancel_refusal) => {
      expect(saleSchema.parse({ ...sale, cancel_refusal }).cancel_refusal).toBe(cancel_refusal);
    },
  );

  it.each([
    ["its lines locked for an unknown reason", { ...sale, lines_lock: "closed" }],
    ["its lines locked by a boolean", { ...sale, lines_lock: true }],
    ["its cancellation refused for an unknown reason", { ...sale, cancel_refusal: "closed" }],
    ["its cancellation refused by a boolean", { ...sale, cancel_refusal: true }],
  ])("rejects a sale with %s", (_case, value) => {
    expect(saleSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["without lines", { ...sale, lines: [] }],
    ["at a price of zero", { ...sale, lines: [{ ...line, list_unit_price: 0, line_total: 0 }] }],
  ])("accepts a sale %s", (_case, value) => {
    expect(saleSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["id", { ...sale, id: undefined }],
    ["lines", { ...sale, lines: undefined }],
    ["total", { ...sale, total: undefined }],
    ["paid amount", { ...sale, paid: undefined }],
    ["pending amount", { ...sale, pending: undefined }],
    ["answer on what locks its lines", { ...sale, lines_lock: undefined }],
    ["answer on why cancelling it is refused", { ...sale, cancel_refusal: undefined }],
    ["refunds on cancelling it", { ...sale, refunds_on_cancel: undefined }],
    [
      "answer on cancelling it needing authorization",
      { ...sale, cancel_authorization_required: undefined },
    ],
    ["line id", { ...sale, lines: [{ ...line, id: undefined }] }],
    ["line product id", { ...sale, lines: [{ ...line, product_id: undefined }] }],
    ["line product name", { ...sale, lines: [{ ...line, product_name: undefined }] }],
    ["line quantity", { ...sale, lines: [{ ...line, quantity: undefined }] }],
    ["line unit price", { ...sale, lines: [{ ...line, list_unit_price: undefined }] }],
    ["line total", { ...sale, lines: [{ ...line, line_total: undefined }] }],
    ["line discount amount", { ...sale, lines: [{ ...line, discount_amount: undefined }] }],
    ["line promotion", { ...sale, lines: [{ ...line, promotion: undefined }] }],
    ["line manual adjustment", { ...sale, lines: [{ ...line, manual_adjustment: undefined }] }],
    [
      "answer on adjusting a line needing authorization",
      { ...sale, adjust_authorization_required: undefined },
    ],
  ])("rejects a sale without its %s", (_field, value) => {
    expect(saleSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["a quantity of zero", { ...line, quantity: 0 }],
    ["a fractional quantity", { ...line, quantity: 1.5 }],
    ["a negative unit price", { ...line, list_unit_price: -1 }],
    ["a fractional unit price", { ...line, list_unit_price: 1.5 }],
    ["a negative line total", { ...line, line_total: -1 }],
    ["a negative discount amount", { ...line, discount_amount: -1 }],
    ["a fractional discount amount", { ...line, discount_amount: 1.5 }],
    ["a promotion of a kind it does not know", { ...line, promotion: { kind: "TWO_FOR_ONE" } }],
    ["a percent of zero", { ...line, promotion: { kind: "PERCENT_OFF", percent: 0 } }],
    ["a percent of 100", { ...line, promotion: { kind: "PERCENT_OFF", percent: 100 } }],
    ["a fractional percent", { ...line, promotion: { kind: "PERCENT_OFF", percent: 12.5 } }],
    [
      "a pay quantity that is not below the buy quantity",
      { ...line, promotion: { kind: "BUY_N_PAY_M", buy_qty: 2, pay_qty: 2 } },
    ],
    [
      "a pay quantity of zero",
      { ...line, promotion: { kind: "BUY_N_PAY_M", buy_qty: 2, pay_qty: 0 } },
    ],
  ])("rejects a line with %s", (_case, value) => {
    expect(saleSchema.safeParse({ ...sale, lines: [value] }).success).toBe(false);
  });

  it.each([-1, 1.5])("rejects a total of %s", (total) => {
    expect(saleSchema.safeParse({ ...sale, total }).success).toBe(false);
  });

  it.each([-1, 1.5])("rejects a paid amount of %s", (paid) => {
    expect(saleSchema.safeParse({ ...sale, paid }).success).toBe(false);
  });

  it.each([-1, 1.5])("rejects a pending amount of %s", (pending) => {
    expect(saleSchema.safeParse({ ...sale, pending }).success).toBe(false);
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 10_000_000 },
    { kind: "no_buyer_identification_threshold" },
  ])("accepts a sale that cannot be charged: %j", (chargeRefusal) => {
    const refused = { ...sale, charge_refusal: chargeRefusal };

    expect(saleSchema.parse(refused)).toEqual(refused);
  });

  it.each([
    ["a missing refusal", { ...sale, charge_refusal: undefined }],
    ["a refusal it does not know", { ...sale, charge_refusal: { kind: "somewhere_else" } }],
    [
      "a threshold refusal without its threshold",
      { ...sale, charge_refusal: { kind: "reaches_buyer_identification_threshold" } },
    ],
    [
      "a fractional threshold",
      {
        ...sale,
        charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 1.5 },
      },
    ],
    [
      "a threshold of zero",
      { ...sale, charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 0 } },
    ],
  ])("rejects a sale with %s", (_case, value) => {
    expect(saleSchema.safeParse(value).success).toBe(false);
  });
});

describe("a sale line's manual adjustment", () => {
  const adjusted = (manual_adjustment: unknown) => ({
    ...sale,
    lines: [{ ...line, manual_adjustment }],
  });

  it.each([
    { kind: "PRICE", value: 0 },
    { kind: "PRICE", value: 1200 },
    { kind: "PERCENT", value: 1 },
    { kind: "PERCENT", value: 100 },
    { kind: "AMOUNT", value: 1 },
    { kind: "AMOUNT", value: 450 },
  ])("accepts $kind of $value", (value) => {
    expect(saleSchema.parse(adjusted(value)).lines[0]?.manual_adjustment).toEqual(value);
  });

  it("carries neither the reason nor who authorized the adjustment", () => {
    const manual_adjustment = {
      kind: "PERCENT",
      value: 10,
      reason: "Cliente frecuente",
      authorized_by: { user_id: "u2", first_name: "Ana" },
    };

    expect(saleSchema.parse(adjusted(manual_adjustment)).lines[0]?.manual_adjustment).toEqual({
      kind: "PERCENT",
      value: 10,
    });
  });

  it.each([
    ["a kind it does not know", { kind: "FREE", value: 1 }],
    ["a percent of zero", { kind: "PERCENT", value: 0 }],
    ["a percent above 100", { kind: "PERCENT", value: 101 }],
    ["a fractional percent", { kind: "PERCENT", value: 12.5 }],
    ["an amount of zero", { kind: "AMOUNT", value: 0 }],
    ["a fractional amount", { kind: "AMOUNT", value: 1.5 }],
    ["a negative price", { kind: "PRICE", value: -1 }],
    ["a price above the maximum", { kind: "PRICE", value: MAX_UNIT_PRICE_CENTS + 1 }],
    ["a fractional price", { kind: "PRICE", value: 1.5 }],
    ["no value", { kind: "PRICE" }],
  ])("rejects an adjustment with %s", (_case, value) => {
    expect(saleSchema.safeParse(adjusted(value)).success).toBe(false);
  });
});

describe("scanProductOutcomeSchema", () => {
  it.each([
    { kind: "added", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "unknown_code" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "weight_needed", product_id: "p2", product_name: "Queso" },
    { kind: "line_quantity_limit", product_name: "Yerba" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "installation_revoked" },
    { kind: "sale_has_payments" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(scanProductOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "added" },
    { kind: "no_price" },
    { kind: "sold_by_weight", product_name: "Queso" },
    { kind: "weight_needed", product_name: "Queso" },
    { kind: "weight_needed", product_id: "p2" },
    { kind: "line_quantity_limit" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(scanProductOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

const refusals = [
  { kind: "not_permitted" },
  { kind: "not_signed_in" },
  { kind: "no_open_session" },
  { kind: "no_open_sale" },
  { kind: "unavailable" },
];

describe("changeLineQuantityOutcomeSchema", () => {
  it.each([
    { kind: "changed", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "unknown_line" },
    { kind: "stale_quantity" },
    { kind: "invalid_quantity" },
    { kind: "sold_by_weight" },
    { kind: "sale_has_payments" },
    ...refusals,
  ])("accepts the outcome $kind", (outcome) => {
    expect(changeLineQuantityOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([{ kind: "changed" }, { kind: "removed", sale }, { kind: "somewhere_else" }, {}])(
    "rejects the outcome %j",
    (outcome) => {
      expect(changeLineQuantityOutcomeSchema.safeParse(outcome).success).toBe(false);
    },
  );
});

describe("changeLineWeightOutcomeSchema", () => {
  it.each([
    { kind: "changed", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "unknown_line" },
    { kind: "stale_weight" },
    { kind: "invalid_weight" },
    { kind: "not_sold_by_weight" },
    { kind: "sale_has_payments" },
    ...refusals,
  ])("accepts the outcome $kind", (outcome) => {
    expect(changeLineWeightOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "changed" },
    { kind: "stale_quantity" },
    { kind: "invalid_quantity" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(changeLineWeightOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("addWeighedProductOutcomeSchema", () => {
  it.each([
    { kind: "added", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "product_unavailable" },
    { kind: "not_sold_by_weight" },
    { kind: "invalid_weight" },
    { kind: "no_price", product_name: "Queso" },
    { kind: "sale_has_payments" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "installation_revoked" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(addWeighedProductOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "added" },
    { kind: "no_price" },
    { kind: "weight_needed", product_id: "p2", product_name: "Queso" },
    { kind: "line_quantity_limit", product_name: "Yerba" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(addWeighedProductOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("weighProductOutcomeSchema", () => {
  it.each([
    { kind: "added", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "weighing" },
    { kind: "scale_unavailable" },
    { kind: "product_unavailable" },
    { kind: "not_sold_by_weight" },
    { kind: "no_price", product_name: "Queso" },
    { kind: "sale_has_payments" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "installation_revoked" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(weighProductOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "added" },
    { kind: "invalid_weight" },
    { kind: "no_price" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(weighProductOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("removeSaleLineOutcomeSchema", () => {
  it.each([
    { kind: "removed", sale, removed_sale_discount: false },
    { kind: "removed", sale, removed_sale_discount: true },
    { kind: "unknown_line" },
    { kind: "sale_has_payments" },
    ...refusals,
  ])("accepts the outcome $kind", (outcome) => {
    expect(removeSaleLineOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "removed" },
    { kind: "removed", sale },
    { kind: "removed", sale, removed_sale_discount: "yes" },
    { kind: "changed", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "invalid_quantity" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(removeSaleLineOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("what cancelling a sale with approved payments refunds", () => {
  const cashRefund = { payment_id: "p1", method: "CASH", amount: 1000, state: "APPROVED" };
  const transferRefund = { payment_id: "p2", method: "TRANSFER", amount: 500, state: "PENDING" };

  it("accepts a refund of each method", () => {
    const refunding = { ...sale, refunds_on_cancel: [cashRefund, transferRefund] };

    expect(saleSchema.parse(refunding)).toEqual(refunding);
  });

  it.each([
    ["a method no payment has", { method: "CARD" }],
    ["a state no refund has", { state: "DONE" }],
    ["a fractional amount", { amount: 0.5 }],
    ["a negative amount", { amount: -1 }],
    ["a missing payment", { payment_id: undefined }],
  ])("rejects a refund with %s", (_case, change) => {
    const refunding = { ...sale, refunds_on_cancel: [{ ...cashRefund, ...change }] };

    expect(saleSchema.safeParse(refunding).success).toBe(false);
  });
});

describe("cancelPaidSaleOutcomeSchema", () => {
  const cancelled = {
    kind: "cancelled",
    refunds: [{ payment_id: "p2", method: "TRANSFER", amount: 500, state: "PENDING" }],
    authorized_by: { user_id: "u2", first_name: "Ana" },
  };

  it.each([
    cancelled,
    { ...cancelled, authorized_by: null },
    { ...cancelled, refunds: [] },
    { kind: "no_open_sale" },
    { kind: "no_open_session" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "locked", consecutive_failures: PIN_SIGN_IN_LOCKOUT_FAILURES },
    { kind: "qr_charge_in_progress" },
    { kind: "holds_qr_payment" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(cancelPaidSaleOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "cancelled", refunds: [] },
    { kind: "cancelled", authorized_by: null },
    {
      ...cancelled,
      refunds: [{ payment_id: "p2", method: "CARD", amount: 500, state: "PENDING" }],
    },
    { kind: "has_approved_payment" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(cancelPaidSaleOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("adjustSaleLineOutcomeSchema", () => {
  it.each([
    { kind: "changed", sale, removed_sale_discount: false },
    { kind: "changed", sale, removed_sale_discount: true },
    { kind: "unknown_line" },
    { kind: "same_as_list_price" },
    { kind: "discount_exceeds_line" },
    { kind: "sale_has_payments" },
    ...refusals,
    { kind: "lacks_permission" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "locked", consecutive_failures: PIN_SIGN_IN_LOCKOUT_FAILURES },
  ])("accepts the outcome $kind", (outcome) => {
    expect(adjustSaleLineOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("carries no authorizer of the change", () => {
    const changed = {
      kind: "changed",
      sale,
      removed_sale_discount: false,
      authorized_by: { user_id: "u2", first_name: "Ana" },
    };

    expect(adjustSaleLineOutcomeSchema.parse(changed)).toEqual({
      kind: "changed",
      sale,
      removed_sale_discount: false,
    });
  });

  it.each([
    { kind: "changed" },
    { kind: "changed", sale },
    { kind: "removed", sale },
    { kind: "stale_quantity" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(adjustSaleLineOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("the outcomes that say a manual discount was removed", () => {
  it.each([
    ["scanning a product", scanProductOutcomeSchema, "added"],
    ["adding a product", addProductOutcomeSchema, "added"],
    ["adding a weighed product", addWeighedProductOutcomeSchema, "added"],
    ["weighing a product", weighProductOutcomeSchema, "added"],
    ["changing a line's quantity", changeLineQuantityOutcomeSchema, "changed"],
    ["changing a line's weight", changeLineWeightOutcomeSchema, "changed"],
  ] as const)("require it when %s changes the sale", (_case, schema, kind) => {
    expect(schema.safeParse({ kind, sale, removed_manual_discount: true }).success).toBe(true);
    expect(schema.safeParse({ kind, sale }).success).toBe(false);
    expect(schema.safeParse({ kind, sale, removed_manual_discount: "yes" }).success).toBe(false);
  });
});

describe("the outcomes that say the discount on the sale's total was removed", () => {
  it.each([
    ["scanning a product", scanProductOutcomeSchema, "added"],
    ["adding a product", addProductOutcomeSchema, "added"],
    ["adding a weighed product", addWeighedProductOutcomeSchema, "added"],
    ["weighing a product", weighProductOutcomeSchema, "added"],
    ["changing a line's quantity", changeLineQuantityOutcomeSchema, "changed"],
    ["changing a line's weight", changeLineWeightOutcomeSchema, "changed"],
  ] as const)("require it when %s changes the sale", (_case, schema, kind) => {
    const answer = { kind, sale, removed_manual_discount: false };

    expect(schema.safeParse({ ...answer, removed_sale_discount: true }).success).toBe(true);
    expect(schema.safeParse(answer).success).toBe(false);
    expect(schema.safeParse({ ...answer, removed_sale_discount: "yes" }).success).toBe(false);
  });
});

describe("a sale's discount on its total", () => {
  const discounted = (sale_discount: unknown) => ({ ...sale, sale_discount });

  it.each([
    { kind: "PERCENT", value: 1, amount: 30 },
    { kind: "PERCENT", value: 100, amount: 3000 },
    { kind: "AMOUNT", value: 1, amount: 1 },
    { kind: "AMOUNT", value: 450, amount: 450 },
  ])("accepts $kind of $value that discounts $amount", (value) => {
    expect(saleSchema.parse(discounted(value)).sale_discount).toEqual(value);
  });

  it("carries neither the reason nor who authorized the discount", () => {
    const sale_discount = {
      kind: "PERCENT",
      value: 10,
      amount: 300,
      reason: "Cliente frecuente",
      authorized_by: { user_id: "u2", first_name: "Ana" },
    };

    expect(saleSchema.parse(discounted(sale_discount)).sale_discount).toEqual({
      kind: "PERCENT",
      value: 10,
      amount: 300,
    });
  });

  it.each([
    ["a kind it does not know", { kind: "PRICE", value: 1, amount: 1 }],
    ["a percent of zero", { kind: "PERCENT", value: 0, amount: 0 }],
    ["a percent above 100", { kind: "PERCENT", value: 101, amount: 10 }],
    ["a fractional percent", { kind: "PERCENT", value: 12.5, amount: 10 }],
    ["an amount of zero", { kind: "AMOUNT", value: 0, amount: 0 }],
    ["a fractional amount", { kind: "AMOUNT", value: 1.5, amount: 2 }],
    ["a negative discounted amount", { kind: "AMOUNT", value: 1, amount: -1 }],
    ["a fractional discounted amount", { kind: "AMOUNT", value: 1, amount: 0.5 }],
    ["no discounted amount", { kind: "AMOUNT", value: 1 }],
    ["no value", { kind: "PERCENT", amount: 1 }],
  ])("rejects a discount with %s", (_case, value) => {
    expect(saleSchema.safeParse(discounted(value)).success).toBe(false);
  });

  it.each([
    ["subtotal", { ...sale, subtotal: undefined }],
    ["discount on the total", { ...sale, sale_discount: undefined }],
    [
      "answer on discounting the total needing authorization",
      { ...sale, sale_discount_authorization_required: undefined },
    ],
    ["a subtotal that is negative", { ...sale, subtotal: -1 }],
    ["a subtotal that is fractional", { ...sale, subtotal: 1.5 }],
  ])("rejects a sale without its %s", (_field, value) => {
    expect(saleSchema.safeParse(value).success).toBe(false);
  });
});

describe("applySaleDiscountOutcomeSchema", () => {
  it.each([
    { kind: "applied", sale },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "discount_exceeds_sale" },
    { kind: "sale_has_payments" },
    ...refusals,
    { kind: "lacks_permission" },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 },
    { kind: "locked", consecutive_failures: PIN_SIGN_IN_LOCKOUT_FAILURES },
  ])("accepts the outcome $kind", (outcome) => {
    expect(applySaleDiscountOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it("carries no authorizer of the discount", () => {
    const applied = { kind: "applied", sale, authorized_by: { user_id: "u2", first_name: "Ana" } };

    expect(applySaleDiscountOutcomeSchema.parse(applied)).toEqual({ kind: "applied", sale });
  });

  it.each([
    { kind: "applied" },
    { kind: "changed", sale },
    { kind: "unknown_line" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(applySaleDiscountOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("previewSaleDiscountOutcomeSchema", () => {
  it.each([
    { kind: "preview", subtotal: 3000, discount_amount: 300, total: 2700 },
    { kind: "preview", subtotal: 3000, discount_amount: 3000, total: 0 },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "discount_exceeds_sale" },
    { kind: "sale_has_payments" },
    ...refusals,
  ])("accepts the outcome $kind", (outcome) => {
    expect(previewSaleDiscountOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    ["an outcome it does not know", { kind: "somewhere_else" }],
    ["no subtotal", { kind: "preview", discount_amount: 300, total: 2700 }],
    ["no discount", { kind: "preview", subtotal: 3000, total: 2700 }],
    ["no total", { kind: "preview", subtotal: 3000, discount_amount: 300 }],
    ["a negative total", { kind: "preview", subtotal: 3000, discount_amount: 300, total: -1 }],
    ["a fractional discount", { kind: "preview", subtotal: 3000, discount_amount: 0.5, total: 1 }],
    ["an authorization refusal", { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 2 }],
  ])("rejects an answer with %s", (_case, outcome) => {
    expect(previewSaleDiscountOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("cancelSaleOutcomeSchema", () => {
  it.each([
    { kind: "cancelled" },
    { kind: "has_approved_payment" },
    { kind: "qr_charge_in_progress" },
    ...refusals,
  ])("accepts the outcome $kind", (outcome) => {
    expect(cancelSaleOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([{ kind: "unknown_line" }, { kind: "somewhere_else" }, {}])(
    "rejects the outcome %j",
    (outcome) => {
      expect(cancelSaleOutcomeSchema.safeParse(outcome).success).toBe(false);
    },
  );
});

describe("chargeSaleInCashOutcomeSchema", () => {
  it.each([
    { kind: "completed", sale_id: "s1", total: 3000, tendered: 5000, change: 2000 },
    { kind: "completed", sale_id: "s1", total: 3000, tendered: 3000, change: 0 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000, pending: 2000 },
    { kind: "invalid_amount" },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 10_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(chargeSaleInCashOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "completed" },
    { kind: "completed", sale_id: "s1", total: 3000, tendered: 5000 },
    { kind: "completed", sale_id: "s1", total: 3000, tendered: 5000, change: -1 },
    { kind: "completed", sale_id: "s1", total: 3000, tendered: 5000.5, change: 2000 },
    { kind: "completed", sale_id: "s1", total: 3000.5, tendered: 5000, change: 2000 },
    { kind: "completed", sale_id: "s1", total: -1, tendered: 5000, change: 2000 },
    { kind: "completed", sale_id: "s1", total: 3000, tendered: -1, change: 2000 },
    { kind: "insufficient_cash", amount_due: 3000 },
    { kind: "partially_paid" },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, pending: 2000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: -1, pending: 2000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000, pending: 1.5 },
    { kind: "reaches_buyer_identification_threshold" },
    { kind: "reaches_buyer_identification_threshold", threshold: 0 },
    { kind: "reaches_buyer_identification_threshold", threshold: 1.5 },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(chargeSaleInCashOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("chargeSaleByTransferOutcomeSchema", () => {
  it.each([
    { kind: "completed", sale_id: "s1", total: 3000 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000, pending: 2000 },
    { kind: "invalid_amount" },
    { kind: "exceeds_pending", pending: 2000 },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "reaches_buyer_identification_threshold", threshold: 10_000_000 },
    { kind: "no_buyer_identification_threshold" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(chargeSaleByTransferOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "completed" },
    { kind: "completed", sale_id: "s1" },
    { kind: "completed", total: 3000 },
    { kind: "completed", sale_id: "s1", total: -1 },
    { kind: "completed", sale_id: "s1", total: 3000.5 },
    { kind: "insufficient_cash", amount_due: 3000 },
    { kind: "exceeds_pending" },
    { kind: "exceeds_pending", pending: -1 },
    { kind: "exceeds_pending", pending: 1.5 },
    { kind: "partially_paid", sale_id: "s1", total: 3000, paid: 1000 },
    { kind: "reaches_buyer_identification_threshold" },
    { kind: "reaches_buyer_identification_threshold", threshold: 0 },
    { kind: "reaches_buyer_identification_threshold", threshold: 1.5 },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(chargeSaleByTransferOutcomeSchema.safeParse(outcome).success).toBe(false);
  });

  it("leaves out what only a cash charge reports", () => {
    expect(
      chargeSaleByTransferOutcomeSchema.parse({
        kind: "completed",
        sale_id: "s1",
        total: 3000,
        tendered: 5000,
        change: 2000,
      }),
    ).toEqual({ kind: "completed", sale_id: "s1", total: 3000 });
  });
});

describe("searchProductsOutcomeSchema", () => {
  const found = {
    product_id: "p1",
    name: "Yerba mate",
    sale_unit: "UNIT",
    unit_price: 2500,
    matches: [{ start: 0, length: 3 }],
  };

  it.each([
    { kind: "results", products: [found], more: false },
    { kind: "results", products: [], more: true },
    { kind: "results", products: [{ ...found, sale_unit: "KG", unit_price: null }], more: false },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(searchProductsOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    ["without saying whether there are more", { kind: "results", products: [found] }],
    ["without its products", { kind: "results", more: false }],
    [
      "a product without its id",
      { kind: "results", more: false, products: [{ ...found, product_id: undefined }] },
    ],
    [
      "a product without its name",
      { kind: "results", more: false, products: [{ ...found, name: undefined }] },
    ],
    [
      "a product without its sale unit",
      { kind: "results", more: false, products: [{ ...found, sale_unit: undefined }] },
    ],
    [
      "a product sold by an unknown unit",
      { kind: "results", more: false, products: [{ ...found, sale_unit: "BOX" }] },
    ],
    [
      "a product without saying whether it has a price",
      { kind: "results", more: false, products: [{ ...found, unit_price: undefined }] },
    ],
    [
      "a negative price",
      { kind: "results", more: false, products: [{ ...found, unit_price: -1 }] },
    ],
    [
      "a fractional price",
      { kind: "results", more: false, products: [{ ...found, unit_price: 1.5 }] },
    ],
    [
      "a product without its matches",
      { kind: "results", more: false, products: [{ ...found, matches: undefined }] },
    ],
    [
      "a match that starts before the name",
      {
        kind: "results",
        more: false,
        products: [{ ...found, matches: [{ start: -1, length: 2 }] }],
      },
    ],
    [
      "an empty match",
      {
        kind: "results",
        more: false,
        products: [{ ...found, matches: [{ start: 0, length: 0 }] }],
      },
    ],
    [
      "a fractional match",
      {
        kind: "results",
        more: false,
        products: [{ ...found, matches: [{ start: 0.5, length: 1 }] }],
      },
    ],
    ["an unknown outcome", { kind: "somewhere_else" }],
    ["an outcome that only adding products has", { kind: "product_unavailable" }],
  ])("rejects %s", (_case, outcome) => {
    expect(searchProductsOutcomeSchema.safeParse(outcome).success).toBe(false);
  });

  it("accepts at most as many products as a search shows", () => {
    const products = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...found, product_id: `p${index}` }));

    expect(
      searchProductsOutcomeSchema.safeParse({
        kind: "results",
        products: products(SEARCH_RESULT_LIMIT),
        more: true,
      }).success,
    ).toBe(true);
    expect(
      searchProductsOutcomeSchema.safeParse({
        kind: "results",
        products: products(SEARCH_RESULT_LIMIT + 1),
        more: true,
      }).success,
    ).toBe(false);
  });
});

describe("addProductOutcomeSchema", () => {
  it.each([
    { kind: "added", sale, removed_manual_discount: false, removed_sale_discount: false },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "weight_needed", product_id: "p2", product_name: "Queso" },
    { kind: "line_quantity_limit", product_name: "Yerba" },
    { kind: "product_unavailable" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "installation_revoked" },
    { kind: "sale_has_payments" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(addProductOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "added" },
    { kind: "no_price" },
    { kind: "sold_by_weight", product_name: "Queso" },
    { kind: "weight_needed", product_name: "Queso" },
    { kind: "line_quantity_limit" },
    { kind: "unknown_code" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(addProductOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});
