import { expect, test } from "vitest";
import { soldQuantityText } from "./sold-quantity-text";

test("writes the units and the weight sold with their symbols", () => {
  expect(soldQuantityText({ units: 1_842, thousandths: 186_400 })).toBe("1.842 u · 186,400 kg");
});

test("writes only the units when nothing was sold by weight", () => {
  expect(soldQuantityText({ units: 12, thousandths: 0 })).toBe("12 u");
});

test("writes only the weight when nothing was sold by unit", () => {
  expect(soldQuantityText({ units: 0, thousandths: 1_250 })).toBe("1,250 kg");
});

test("writes zero units when nothing was sold", () => {
  expect(soldQuantityText({ units: 0, thousandths: 0 })).toBe("0 u");
});
