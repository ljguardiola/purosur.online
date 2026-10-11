import { expect, test } from "vitest";
import { perSaleUnit } from "./per-sale-unit";

test("writes an amount per kilo with the kilo it is per", () => {
  expect(perSaleUnit("$ 10.205,84", "KG")).toBe("$ 10.205,84 / kg");
});

test("writes an amount per unit with nothing after it", () => {
  expect(perSaleUnit("$ 5.440,00", "UNIT")).toBe("$ 5.440,00");
});
