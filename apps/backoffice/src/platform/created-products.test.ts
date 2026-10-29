import { expect, test } from "vitest";
import { withCreatedProducts } from "./created-products";

const honey = { id: "honey", name: "Miel" };
const almonds = { id: "almonds", name: "Almendras" };

test("offers the products created from the selector after the stored ones", () => {
  expect(withCreatedProducts([honey], [almonds])).toEqual([honey, almonds]);
});

test("offers a created product once when the stored products already include it", () => {
  expect(withCreatedProducts([honey, almonds], [almonds])).toEqual([honey, almonds]);
});

test("offers the stored products alone when none was created", () => {
  expect(withCreatedProducts([honey], [])).toEqual([honey]);
});
