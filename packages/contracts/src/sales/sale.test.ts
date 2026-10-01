import { BARCODE_MAX_LENGTH, PRODUCT_NAME_MAX_LENGTH, SEARCH_RESULT_LIMIT } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  addProductOutcomeSchema,
  cancelSaleOutcomeSchema,
  changeLineQuantityOutcomeSchema,
  chargeSaleByTransferOutcomeSchema,
  chargeSaleInCashOutcomeSchema,
  removeSaleLineOutcomeSchema,
  saleSchema,
  scannedCodeSchema,
  scanProductOutcomeSchema,
  searchProductsOutcomeSchema,
  searchQuerySchema,
} from "./sale.js";

const line = {
  id: "l1",
  product_id: "p1",
  product_name: "Yerba",
  quantity: 2,
  list_unit_price: 1500,
  discount_amount: 0,
  promotion: null,
  line_total: 3000,
};
const sale = { id: "s1", lines: [line], total: 3000 };

describe("scannedCodeSchema", () => {
  it.each(["7791234567890", "A", "x".repeat(BARCODE_MAX_LENGTH), "😀".repeat(BARCODE_MAX_LENGTH)])(
    "accepts the code %s",
    (code) => {
      expect(scannedCodeSchema.safeParse(code).success).toBe(true);
    },
  );

  it.each([
    "",
    "x".repeat(BARCODE_MAX_LENGTH + 1),
    "😀".repeat(BARCODE_MAX_LENGTH + 1),
    7791,
    null,
  ])("rejects the code %j", (code) => {
    expect(scannedCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("saleSchema", () => {
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
    ["line id", { ...sale, lines: [{ ...line, id: undefined }] }],
    ["line product id", { ...sale, lines: [{ ...line, product_id: undefined }] }],
    ["line product name", { ...sale, lines: [{ ...line, product_name: undefined }] }],
    ["line quantity", { ...sale, lines: [{ ...line, quantity: undefined }] }],
    ["line unit price", { ...sale, lines: [{ ...line, list_unit_price: undefined }] }],
    ["line total", { ...sale, lines: [{ ...line, line_total: undefined }] }],
    ["line discount amount", { ...sale, lines: [{ ...line, discount_amount: undefined }] }],
    ["line promotion", { ...sale, lines: [{ ...line, promotion: undefined }] }],
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
});

describe("scanProductOutcomeSchema", () => {
  it.each([
    { kind: "added", sale },
    { kind: "unknown_code" },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "sold_by_weight", product_name: "Queso" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "installation_revoked" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(scanProductOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "added" },
    { kind: "no_price" },
    { kind: "sold_by_weight" },
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
    { kind: "changed", sale },
    { kind: "unknown_line" },
    { kind: "stale_quantity" },
    { kind: "invalid_quantity" },
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

describe("removeSaleLineOutcomeSchema", () => {
  it.each([{ kind: "removed", sale }, { kind: "unknown_line" }, ...refusals])(
    "accepts the outcome $kind",
    (outcome) => {
      expect(removeSaleLineOutcomeSchema.parse(outcome)).toEqual(outcome);
    },
  );

  it.each([
    { kind: "removed" },
    { kind: "changed", sale },
    { kind: "invalid_quantity" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(removeSaleLineOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("cancelSaleOutcomeSchema", () => {
  it.each([{ kind: "cancelled" }, { kind: "has_approved_payment" }, ...refusals])(
    "accepts the outcome $kind",
    (outcome) => {
      expect(cancelSaleOutcomeSchema.parse(outcome)).toEqual(outcome);
    },
  );

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
    { kind: "insufficient_cash", amount_due: 3000 },
    { kind: "invalid_amount" },
    { kind: "empty_sale" },
    { kind: "zero_total" },
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
    { kind: "insufficient_cash" },
    { kind: "insufficient_cash", amount_due: -1 },
    { kind: "insufficient_cash", amount_due: 1.5 },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(chargeSaleInCashOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});

describe("chargeSaleByTransferOutcomeSchema", () => {
  it.each([
    { kind: "completed", sale_id: "s1", total: 3000 },
    { kind: "empty_sale" },
    { kind: "zero_total" },
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
    { kind: "invalid_amount" },
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

describe("searchQuerySchema", () => {
  it.each([
    "",
    "yer",
    "té verde",
    "x".repeat(PRODUCT_NAME_MAX_LENGTH),
    "😀".repeat(PRODUCT_NAME_MAX_LENGTH),
  ])("accepts the query %j", (query) => {
    expect(searchQuerySchema.safeParse(query).success).toBe(true);
  });

  it.each([
    "x".repeat(PRODUCT_NAME_MAX_LENGTH + 1),
    "😀".repeat(PRODUCT_NAME_MAX_LENGTH + 1),
    7,
    null,
  ])("rejects the query %j", (query) => {
    expect(searchQuerySchema.safeParse(query).success).toBe(false);
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
    { kind: "added", sale },
    { kind: "no_price", product_name: "Yerba" },
    { kind: "sold_by_weight", product_name: "Queso" },
    { kind: "product_unavailable" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "installation_revoked" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(addProductOutcomeSchema.parse(outcome)).toEqual(outcome);
  });

  it.each([
    { kind: "added" },
    { kind: "no_price" },
    { kind: "sold_by_weight" },
    { kind: "unknown_code" },
    { kind: "somewhere_else" },
    {},
  ])("rejects the outcome %j", (outcome) => {
    expect(addProductOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});
