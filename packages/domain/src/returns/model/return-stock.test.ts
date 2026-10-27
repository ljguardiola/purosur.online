import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { returnStockDelta, returnStockMovements } from "./return-stock.js";

describe("returnStockDelta", () => {
  it("puts back a unit line's quantity in stock units", () => {
    expect(returnStockDelta("UNIT", 3)).toBe(3000);
  });

  it("puts back a weighed line's quantity as the thousandths it was sold in", () => {
    expect(returnStockDelta("KG", 250)).toBe(250);
  });

  it("is exactly what the sale took out of stock for the same quantity", () => {
    const soldDelta = (saleUnit: "UNIT" | "KG", quantity: number) =>
      saleUnit === "UNIT" ? -quantity * 1000 : -quantity;

    fc.assert(
      fc.property(
        fc.constantFrom("UNIT", "KG"),
        fc.integer({ min: 1, max: 100_000 }),
        (unit, quantity) => {
          expect(returnStockDelta(unit, quantity) + soldDelta(unit, quantity)).toBe(0);
        },
      ),
    );
  });
});

describe("returnStockMovements", () => {
  it("puts an item back on the shelf with a single movement", () => {
    expect(returnStockMovements("restock", 3000)).toEqual([
      { kind: "return", reason: null, delta: 3000 },
    ]);
  });

  it("puts an item back and then takes it out as a loss for return_discard when it is thrown away", () => {
    expect(returnStockMovements("discard", 3000)).toEqual([
      { kind: "return", reason: null, delta: 3000 },
      { kind: "loss", reason: "return_discard", delta: -3000 },
    ]);
  });

  it("adds the whole quantity to the stock count when the item goes back to the shelf and nothing when it is thrown away", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("restock", "discard"),
        fc.integer({ min: 1, max: 100_000 }),
        (disposition, delta) => {
          const net = returnStockMovements(disposition, delta).reduce(
            (sum, movement) => sum + movement.delta,
            0,
          );

          expect(net).toBe(disposition === "restock" ? delta : 0);
        },
      ),
    );
  });
});
