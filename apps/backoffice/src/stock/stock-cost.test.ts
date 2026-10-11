import { expect, test } from "vitest";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";

test("says there is no cost when the cloud answered none", () => {
  expect(formatStockUnitCost(null, "KG")).toBe("Sin costo");
  expect(formatStockUnitCost(null, "UNIT")).toBe("Sin costo");
});

test("writes a cost per sale unit, a negative one with a minus sign", () => {
  expect(formatStockUnitCost(1_020_584, "KG")).toBe("$ 10.205,84 / kg");
  expect(formatStockUnitCost(-305_000, "KG")).toBe("− $ 3.050,00 / kg");
});

test("writes a value, a negative one with a minus sign, and a dash when there is none", () => {
  expect(formatStockValue(12_400_100)).toBe("$ 124.001,00");
  expect(formatStockValue(-915_000)).toBe("− $ 9.150,00");
  expect(formatStockValue(null)).toBe("—");
});
