import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isCountedQuantity,
  isMovementQuantity,
  MAX_STOCK_QUANTITY,
  mayBeCountedQuantity,
  mayBeMovementQuantity,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "./stock-quantity.js";

describe("STOCK_QUANTITY_PER_UNIT", () => {
  it("keeps a quantity in thousandths of its sale unit, so a kilo holds a thousand grams", () => {
    expect(STOCK_QUANTITY_PER_UNIT).toBe(1000);
  });
});

describe("STOCK_QUANTITY_DECIMALS", () => {
  it("writes a quantity in its sale unit with the three decimals a thousandth needs", () => {
    expect(STOCK_QUANTITY_DECIMALS).toBe(3);
    expect(10 ** STOCK_QUANTITY_DECIMALS).toBe(STOCK_QUANTITY_PER_UNIT);
  });
});

describe("MAX_STOCK_QUANTITY", () => {
  it("keeps a sum of a million of the largest quantities an exact number", () => {
    expect(Number.isSafeInteger(MAX_STOCK_QUANTITY * 1_000_000)).toBe(true);
  });
});

describe("isMovementQuantity", () => {
  it("accepts any whole number of grams of a product sold by the kilo", () => {
    expect(isMovementQuantity("KG", 1)).toBe(true);
    expect(isMovementQuantity("KG", 12_150)).toBe(true);
    expect(isMovementQuantity("KG", MAX_STOCK_QUANTITY)).toBe(true);
  });

  it("accepts only whole units of a product sold by the unit", () => {
    expect(isMovementQuantity("UNIT", 1000)).toBe(true);
    expect(isMovementQuantity("UNIT", 23_000)).toBe(true);
    expect(isMovementQuantity("UNIT", 1500)).toBe(false);
    expect(isMovementQuantity("UNIT", 999)).toBe(false);
  });

  it.each([0, -1000, 0.5, MAX_STOCK_QUANTITY + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s as a movement's quantity",
    (quantity) => {
      expect(isMovementQuantity("KG", quantity)).toBe(false);
      expect(isMovementQuantity("UNIT", quantity)).toBe(false);
    },
  );

  it("accepts every whole number of units a stock quantity can hold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Math.floor(MAX_STOCK_QUANTITY / STOCK_QUANTITY_PER_UNIT) }),
        (units) => isMovementQuantity("UNIT", units * STOCK_QUANTITY_PER_UNIT),
      ),
    );
  });
});

describe("isCountedQuantity", () => {
  it("accepts counting nothing, since a shelf can be empty", () => {
    expect(isCountedQuantity("KG", 0)).toBe(true);
    expect(isCountedQuantity("UNIT", 0)).toBe(true);
  });

  it("accepts the same quantities a movement accepts", () => {
    expect(isCountedQuantity("KG", 1)).toBe(true);
    expect(isCountedQuantity("KG", MAX_STOCK_QUANTITY)).toBe(true);
    expect(isCountedQuantity("UNIT", 16_000)).toBe(true);
  });

  it.each([
    ["KG", -1],
    ["KG", 0.5],
    ["KG", MAX_STOCK_QUANTITY + 1],
    ["KG", Number.NaN],
    ["UNIT", 1500],
    ["UNIT", -1000],
  ] as const)("rejects a %s count of %s", (saleUnit, quantity) => {
    expect(isCountedQuantity(saleUnit, quantity)).toBe(false);
  });
});

describe("mayBeCountedQuantity", () => {
  it("accepts every quantity a count of some sale unit may hold", () => {
    expect(mayBeCountedQuantity(0)).toBe(true);
    expect(mayBeCountedQuantity(1)).toBe(true);
    expect(mayBeCountedQuantity(1500)).toBe(true);
    expect(mayBeCountedQuantity(MAX_STOCK_QUANTITY)).toBe(true);
  });

  it.each([-1, 0.5, MAX_STOCK_QUANTITY + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s, which no count may hold",
    (quantity) => {
      expect(mayBeCountedQuantity(quantity)).toBe(false);
    },
  );

  it("accepts a quantity exactly when a count of some sale unit accepts it", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.double()), (quantity) => {
        expect(mayBeCountedQuantity(quantity)).toBe(
          isCountedQuantity("KG", quantity) || isCountedQuantity("UNIT", quantity),
        );
      }),
    );
  });
});

describe("mayBeMovementQuantity", () => {
  it("accepts every quantity a movement of some sale unit may carry", () => {
    expect(mayBeMovementQuantity(1)).toBe(true);
    expect(mayBeMovementQuantity(1500)).toBe(true);
    expect(mayBeMovementQuantity(MAX_STOCK_QUANTITY)).toBe(true);
  });

  it.each([0, -1, 0.5, MAX_STOCK_QUANTITY + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %s, which no movement may carry",
    (quantity) => {
      expect(mayBeMovementQuantity(quantity)).toBe(false);
    },
  );

  it("accepts a quantity exactly when a movement of some sale unit accepts it", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.double()), (quantity) => {
        expect(mayBeMovementQuantity(quantity)).toBe(
          isMovementQuantity("KG", quantity) || isMovementQuantity("UNIT", quantity),
        );
      }),
    );
  });
});
