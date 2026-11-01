import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ORDER_SUGGESTION_SALES_DAYS,
  orderSuggestionPeriod,
  packagesToCover,
  quantityToOrderWithoutSupplier,
  shortfallToCover,
  soldThousandths,
} from "./order-suggestion.js";

describe("orderSuggestionPeriod", () => {
  it("is the 30 calendar days ending today, today included", () => {
    expect(ORDER_SUGGESTION_SALES_DAYS).toBe(30);
    expect(orderSuggestionPeriod("2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("crosses a month and a year boundary", () => {
    expect(orderSuggestionPeriod("2026-01-10")).toEqual({ from: "2025-12-12", to: "2026-01-10" });
  });
});

describe("soldThousandths", () => {
  it("counts the units of a product sold by the unit in thousandths", () => {
    expect(soldThousandths({ units: 120, thousandths: 0 }, "UNIT")).toBe(120_000);
  });

  it("counts the thousandths of a product sold by weight", () => {
    expect(soldThousandths({ units: 0, thousandths: 7_500 }, "KG")).toBe(7_500);
  });

  it("ignores what was sold in the other sale unit", () => {
    expect(soldThousandths({ units: 3, thousandths: 900 }, "UNIT")).toBe(3_000);
    expect(soldThousandths({ units: 3, thousandths: 900 }, "KG")).toBe(900);
  });
});

describe("shortfallToCover", () => {
  it("is what the average daily sales over the coverage days need beyond the stock", () => {
    expect(
      shortfallToCover({ soldThousandths: 120_000, coverageDays: 15, stockThousandths: 12_000 }),
    ).toEqual({ numerator: 1_440_000n, denominator: 30n });
  });

  it("is nothing when nothing was sold", () => {
    expect(
      shortfallToCover({ soldThousandths: 0, coverageDays: 15, stockThousandths: 0 }),
    ).toBeNull();
  });

  it("is nothing when the stock covers the coverage days exactly", () => {
    expect(
      shortfallToCover({ soldThousandths: 120_000, coverageDays: 15, stockThousandths: 60_000 }),
    ).toBeNull();
  });

  it("is nothing when the stock exceeds the coverage days", () => {
    expect(
      shortfallToCover({ soldThousandths: 120_000, coverageDays: 15, stockThousandths: 90_000 }),
    ).toBeNull();
  });

  it("covers a negative stock even when nothing was sold", () => {
    expect(
      shortfallToCover({ soldThousandths: 0, coverageDays: 15, stockThousandths: -5_000 }),
    ).toEqual({ numerator: 150_000n, denominator: 30n });
  });

  it("is exact for any sales, coverage and stock", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000 }),
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: -2_000_000_000, max: 2_000_000_000 }),
        (sold, coverageDays, stock) => {
          const shortfall = shortfallToCover({
            soldThousandths: sold,
            coverageDays,
            stockThousandths: stock,
          });
          const positive = sold * coverageDays > stock * 30;
          expect(shortfall !== null).toBe(positive);
          if (shortfall !== null) {
            expect(shortfall.denominator).toBe(30n);
            expect(shortfall.numerator).toBe(
              BigInt(sold) * BigInt(coverageDays) - BigInt(stock) * 30n,
            );
          }
        },
      ),
    );
  });
});

describe("packagesToCover", () => {
  it("rounds the shortfall up to whole packages", () => {
    const shortfall = { numerator: 1_440_000n, denominator: 30n };

    expect(packagesToCover(shortfall, 12_000)).toBe(4);
    expect(packagesToCover(shortfall, 10_000)).toBe(5);
    expect(packagesToCover(shortfall, 48_001)).toBe(1);
  });

  it("keeps a fractional shortfall's remainder from being dropped", () => {
    expect(packagesToCover({ numerator: 1n, denominator: 30n }, 1_000)).toBe(1);
  });

  it("covers the shortfall with the least packages for any shortfall and package", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_000_000_000 }),
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (numerator, denominator, packageQuantity) => {
          const shortfall = { numerator: BigInt(numerator), denominator: BigInt(denominator) };
          const packages = BigInt(packagesToCover(shortfall, packageQuantity));
          const covered = packages * BigInt(packageQuantity) * shortfall.denominator;
          expect(covered >= shortfall.numerator).toBe(true);
          expect(
            (packages - 1n) * BigInt(packageQuantity) * shortfall.denominator < shortfall.numerator,
          ).toBe(true);
        },
      ),
    );
  });
});

describe("quantityToOrderWithoutSupplier", () => {
  it("rounds a product sold by the unit up to whole units", () => {
    expect(
      quantityToOrderWithoutSupplier({ numerator: 1_440_000n, denominator: 30n }, "UNIT"),
    ).toBe(48_000);
    expect(quantityToOrderWithoutSupplier({ numerator: 100n, denominator: 30n }, "UNIT")).toBe(
      1_000,
    );
    expect(quantityToOrderWithoutSupplier({ numerator: 30_001n, denominator: 30n }, "UNIT")).toBe(
      2_000,
    );
  });

  it("rounds a product sold by weight up to the thousandth", () => {
    expect(quantityToOrderWithoutSupplier({ numerator: 100n, denominator: 30n }, "KG")).toBe(4);
    expect(quantityToOrderWithoutSupplier({ numerator: 90n, denominator: 30n }, "KG")).toBe(3);
  });
});
