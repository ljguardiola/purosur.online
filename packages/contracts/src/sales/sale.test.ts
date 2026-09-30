import { BARCODE_MAX_LENGTH, PRODUCT_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  addProductOutcomeSchema,
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
  ])("rejects a sale without its %s", (_field, value) => {
    expect(saleSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["a quantity of zero", { ...line, quantity: 0 }],
    ["a fractional quantity", { ...line, quantity: 1.5 }],
    ["a negative unit price", { ...line, list_unit_price: -1 }],
    ["a fractional unit price", { ...line, list_unit_price: 1.5 }],
    ["a negative line total", { ...line, line_total: -1 }],
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
