import { describe, expect, it } from "vitest";
import { productToAddFrom } from "./product-to-add";

const LECHE = {
  product_id: "leche",
  name: "Leche vegetal",
  sale_unit: "UNIT",
  unit_price: 430_000,
};

describe("productToAddFrom", () => {
  it.each([LECHE, { ...LECHE, sale_unit: "KG" }, { ...LECHE, unit_price: null }])(
    "reads the product a screen hands the sale to add: %j",
    (product) => {
      expect(productToAddFrom(product)).toEqual(product);
    },
  );

  it.each([
    ["nothing", undefined],
    ["a text", "leche"],
    ["a product without its id", { ...LECHE, product_id: undefined }],
    ["a product without its name", { ...LECHE, name: 3 }],
    ["a product sold by an unknown unit", { ...LECHE, sale_unit: "BOX" }],
    ["a product without saying whether it has a price", { ...LECHE, unit_price: undefined }],
  ])("reads no product from %s", (_case, value) => {
    expect(productToAddFrom(value)).toBeUndefined();
  });
});
