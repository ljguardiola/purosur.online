import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  effectiveCoverageDays,
  expiryCapQuantity,
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

describe("effectiveCoverageDays", () => {
  it("is the coverage days when no lot gives a shelf life", () => {
    expect(effectiveCoverageDays(15, null)).toEqual({ days: 15, cappedByExpiry: false });
  });

  it("is the shelf life when it is shorter than the coverage days", () => {
    expect(effectiveCoverageDays(15, 10)).toEqual({ days: 10, cappedByExpiry: true });
    expect(effectiveCoverageDays(15, 0)).toEqual({ days: 0, cappedByExpiry: true });
  });

  it("is the coverage days when the shelf life is as long or longer", () => {
    expect(effectiveCoverageDays(15, 15)).toEqual({ days: 15, cappedByExpiry: false });
    expect(effectiveCoverageDays(15, 40)).toEqual({ days: 15, cappedByExpiry: false });
  });
});

describe("expiryCapQuantity", () => {
  it("is what the average daily sales need over the shelf life beyond the stock", () => {
    expect(
      expiryCapQuantity({ soldThousandths: 120_000, shelfLifeDays: 10, stockThousandths: 20_000 }),
    ).toEqual({ numerator: 600_000n, denominator: 30n });
  });

  it("is null when no lot gives a shelf life", () => {
    expect(
      expiryCapQuantity({ soldThousandths: 120_000, shelfLifeDays: null, stockThousandths: 0 }),
    ).toBeNull();
  });
});

describe("packagesToCover with an expiry cap", () => {
  const shortfall = { numerator: 600_000n, denominator: 30n };

  it("rounds down when rounding up would exceed the cap", () => {
    expect(packagesToCover(shortfall, 12_000, shortfall)).toBe(1);
  });

  it("rounds up when the rounded-up quantity does not exceed the cap", () => {
    expect(packagesToCover(shortfall, 10_000, shortfall)).toBe(2);
    expect(packagesToCover(shortfall, 12_000, { numerator: 720_000n, denominator: 30n })).toBe(2);
  });

  it("rounds down to no packages when one package holds more than the cap", () => {
    expect(packagesToCover(shortfall, 48_000, shortfall)).toBe(0);
  });

  it("never orders more than the cap holds, nor less than the packages that fit in it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_000_000_000 }),
        fc.integer({ min: 0, max: 2_000_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (shortfallNumerator, slack, packageQuantity) => {
          const need = { numerator: BigInt(shortfallNumerator), denominator: 30n };
          const cap = { numerator: need.numerator + BigInt(slack), denominator: 30n };
          const packages = BigInt(packagesToCover(need, packageQuantity, cap));
          const size = BigInt(packageQuantity) * 30n;
          const roundedUp = (need.numerator + size - 1n) / size;
          const rounding = roundedUp * size <= cap.numerator ? roundedUp : cap.numerator / size;
          expect(packages).toBe(rounding);
          expect(packages * size <= cap.numerator).toBe(true);
        },
      ),
    );
  });
});

describe("quantityToOrderWithoutSupplier with an expiry cap", () => {
  const shortfall = { numerator: 600_000n, denominator: 30n };

  it("rounds a product sold by the unit down to whole units when rounding up would exceed the cap", () => {
    const cap = { numerator: 100_001n, denominator: 30n };

    expect(quantityToOrderWithoutSupplier(cap, "UNIT", cap)).toBe(3_000);
  });

  it("rounds a product sold by weight down to the thousandth when rounding up would exceed the cap", () => {
    expect(
      quantityToOrderWithoutSupplier({ numerator: 100n, denominator: 30n }, "KG", {
        numerator: 100n,
        denominator: 30n,
      }),
    ).toBe(3);
  });

  it("keeps the rounded-up quantity when it fits in the cap", () => {
    expect(quantityToOrderWithoutSupplier(shortfall, "UNIT", shortfall)).toBe(20_000);
    expect(
      quantityToOrderWithoutSupplier({ numerator: 100n, denominator: 30n }, "UNIT", {
        numerator: 30_000n,
        denominator: 30n,
      }),
    ).toBe(1_000);
  });
});
