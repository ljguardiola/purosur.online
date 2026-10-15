import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { saleVoidStockMovements } from "./sale-void-stock-movements.js";

describe("saleVoidStockMovements", () => {
  it("gives back to each line's product exactly what the sale took out for that line", () => {
    expect(
      saleVoidStockMovements([
        { saleLineId: "line-1", productId: "yerba", delta: -3000 },
        { saleLineId: "line-2", productId: "queso", delta: -1250 },
      ]),
    ).toEqual([
      { saleLineId: "line-1", productId: "yerba", delta: 3000 },
      { saleLineId: "line-2", productId: "queso", delta: 1250 },
    ]);
  });

  it("keeps two lines of the same product apart", () => {
    expect(
      saleVoidStockMovements([
        { saleLineId: "line-1", productId: "yerba", delta: -1000 },
        { saleLineId: "line-2", productId: "yerba", delta: -2000 },
      ]),
    ).toEqual([
      { saleLineId: "line-1", productId: "yerba", delta: 1000 },
      { saleLineId: "line-2", productId: "yerba", delta: 2000 },
    ]);
  });

  it("returns nothing for a sale that took nothing out", () => {
    expect(saleVoidStockMovements([])).toEqual([]);
  });

  it("restores a balance to what it was before the sale, whatever the movements", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            saleLineId: fc.string({ minLength: 1 }),
            productId: fc.string({ minLength: 1 }),
            delta: fc.integer({ min: -99_999_999, max: -1 }),
          }),
        ),
        (movements) => {
          const reversal = saleVoidStockMovements(movements);
          const net = [...movements, ...reversal].reduce((sum, { delta }) => sum + delta, 0);
          expect(net).toBe(0);
          expect(reversal.map(({ saleLineId }) => saleLineId)).toEqual(
            movements.map(({ saleLineId }) => saleLineId),
          );
        },
      ),
    );
  });
});
