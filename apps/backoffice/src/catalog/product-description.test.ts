import { expect, test } from "vitest";
import { productDescription } from "./product-description";
import { almondOil, cabriola, creamCheese, honey, vitora } from "./test-support/products";

test("names a product by its name, brand and net content", () => {
  expect(productDescription(almondOil, [cabriola, vitora])).toBe(
    "Aceite de Almendras Vitora 30 ml",
  );
});

test("names a product with neither brand nor net content by its name alone", () => {
  expect(productDescription(honey, [vitora])).toBe("Miel pura de abeja 1 kg");
});

test("leaves out the brand of a product whose brand is not among the brands given", () => {
  expect(productDescription(creamCheese, [vitora])).toBe("Queso crema");
});
