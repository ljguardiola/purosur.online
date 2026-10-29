import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import {
  commonDenominator,
  isCostPaid,
  isPackageCount,
  lineValue,
  ONE_SALE_UNIT_QUANTITY,
  packagedQuantity,
} from "./purchase-line.js";
import { equalFractions } from "./test-support/equal-fractions.js";

function cost(costPaidCents: number, quantity: number, quantityPerPackage: number) {
  return { costPaidCents, quantity, quantityPerPackage };
}

describe("isPackageCount", () => {
  it.each([1, 12, MAX_STOCK_QUANTITY])("accepts %s packages", (packages) => {
    expect(isPackageCount(packages)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_STOCK_QUANTITY + 1])("rejects %s packages", (packages) => {
    expect(isPackageCount(packages)).toBe(false);
  });
});

describe("isCostPaid", () => {
  it.each([0, 1, 123_456, MAX_CASH_AMOUNT_CENTS])("accepts %s cents", (cents) => {
    expect(isCostPaid(cents)).toBe(true);
  });

  it.each([-1, 0.5, Number.NaN, MAX_CASH_AMOUNT_CENTS + 1])("rejects %s cents", (cents) => {
    expect(isCostPaid(cents)).toBe(false);
  });
});

describe("ONE_SALE_UNIT_QUANTITY", () => {
  it("is one unit or one kilo in stock quantity units", () => {
    expect(ONE_SALE_UNIT_QUANTITY).toBe(1000);
  });
});

describe("packagedQuantity", () => {
  it("multiplies the packages by the packaging's quantity per package", () => {
    expect(packagedQuantity(2, 12_000)).toBe(24_000);
    expect(packagedQuantity(3, 25_000)).toBe(75_000);
  });
});

describe("lineValue", () => {
  it("is the cost paid per package times the packages bought, which is the quantity over the package size", () => {
    expect(
      equalFractions(lineValue(cost(1000, 12_000, 12_000)), {
        numerator: 1000n,
        denominator: 1n,
      }),
    ).toBe(true);
    expect(
      equalFractions(lineValue(cost(1000, 24_000, 12_000)), {
        numerator: 2000n,
        denominator: 1n,
      }),
    ).toBe(true);
  });

  it("keeps the fraction of a cent of a line loaded by quantity", () => {
    expect(
      equalFractions(lineValue(cost(333, 2500, 1000)), { numerator: 1665n, denominator: 2n }),
    ).toBe(true);
  });
});

describe("commonDenominator", () => {
  function over(...denominators: bigint[]) {
    return denominators.map((denominator) => ({ numerator: 1n, denominator }));
  }

  it("is the least multiple every denominator divides", () => {
    expect(commonDenominator(over(4n, 6n))).toBe(12n);
    expect(commonDenominator(over(1000n, 1000n, 1000n))).toBe(1000n);
    expect(commonDenominator(over(12_000n, 1000n, 25_000n))).toBe(300_000n);
    expect(commonDenominator(over(3n, 7n))).toBe(21n);
  });

  it("is one for no fractions", () => {
    expect(commonDenominator([])).toBe(1n);
  });
});
