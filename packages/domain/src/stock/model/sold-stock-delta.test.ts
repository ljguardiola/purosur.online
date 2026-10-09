import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { soldStockDelta } from "./sold-stock-delta.js";
import { isMovementQuantity } from "./stock-quantity.js";

describe("soldStockDelta", () => {
  it("subtracts a thousand thousandths of stock per unit of a product sold by the unit", () => {
    expect(soldStockDelta({ saleUnit: "UNIT", units: 3 })).toBe(-3000);
  });

  it("subtracts the weight sold of a product sold by the kilo", () => {
    expect(soldStockDelta({ saleUnit: "KG", thousandths: 1250 })).toBe(-1250);
  });

  it("always subtracts a quantity a movement of the product's sale unit may carry", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            saleUnit: fc.constant("UNIT" as const),
            units: fc.integer({ min: 1, max: 99_999 }),
          }),
          fc.record({
            saleUnit: fc.constant("KG" as const),
            thousandths: fc.integer({ min: 1, max: 99_999_999 }),
          }),
        ),
        (sold) => {
          const delta = soldStockDelta(sold);
          expect(delta).toBeLessThan(0);
          expect(isMovementQuantity(sold.saleUnit, -delta)).toBe(true);
        },
      ),
    );
  });
});
