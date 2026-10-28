import { expect, test } from "vitest";
import { saleUnitQuantityText } from "./sale-unit-quantity";

test("writes a quantity of units with its unit", () => {
  expect(saleUnitQuantityText("UNIT", 2)).toBe("2 u");
});

test("writes a quantity by weight in kilograms", () => {
  expect(saleUnitQuantityText("KG", 350)).toBe("0,350 kg");
});
