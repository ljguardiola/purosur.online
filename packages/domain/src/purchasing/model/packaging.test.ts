import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY, STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";
import {
  isPackagingNameTooLong,
  isQuantityPerPackage,
  mayDefinePackagingsFor,
  PACKAGING_NAME_MAX_LENGTH,
} from "./packaging.js";

describe("PACKAGING_NAME_MAX_LENGTH", () => {
  it("allows a packaging name of up to 100 characters", () => {
    expect(PACKAGING_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("isPackagingNameTooLong", () => {
  it("accepts a name of exactly the limit and rejects one character more", () => {
    expect(isPackagingNameTooLong("a".repeat(PACKAGING_NAME_MAX_LENGTH))).toBe(false);
    expect(isPackagingNameTooLong("a".repeat(PACKAGING_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character", () => {
    expect(isPackagingNameTooLong("📦".repeat(PACKAGING_NAME_MAX_LENGTH))).toBe(false);
    expect(isPackagingNameTooLong("📦".repeat(PACKAGING_NAME_MAX_LENGTH + 1))).toBe(true);
  });
});

describe("isQuantityPerPackage", () => {
  it("takes only whole units for a product sold by the unit", () => {
    expect(isQuantityPerPackage("UNIT", 12 * STOCK_QUANTITY_PER_UNIT)).toBe(true);
    expect(isQuantityPerPackage("UNIT", 12 * STOCK_QUANTITY_PER_UNIT + 1)).toBe(false);
  });

  it("takes any positive integer number of grams for a product sold by the kilo", () => {
    expect(isQuantityPerPackage("KG", 1)).toBe(true);
    expect(isQuantityPerPackage("KG", 25_000)).toBe(true);
  });

  it.each(["UNIT", "KG"] as const)(
    "refuses zero, a negative and a fractional quantity for %s",
    (unit) => {
      expect(isQuantityPerPackage(unit, 0)).toBe(false);
      expect(isQuantityPerPackage(unit, -STOCK_QUANTITY_PER_UNIT)).toBe(false);
      expect(isQuantityPerPackage(unit, 1500.5)).toBe(false);
    },
  );

  it("refuses a quantity above the stock maximum", () => {
    expect(isQuantityPerPackage("KG", MAX_STOCK_QUANTITY)).toBe(true);
    expect(isQuantityPerPackage("KG", MAX_STOCK_QUANTITY + 1)).toBe(false);
  });

  it("agrees with the quantity a stock movement may carry, for any quantity", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("UNIT", "KG"),
        fc.integer({ min: -5000, max: 5000 }),
        (unit, n) => {
          expect(isQuantityPerPackage(unit, n)).toBe(n > 0 && (unit === "KG" || n % 1000 === 0));
        },
      ),
    );
  });
});

describe("mayDefinePackagingsFor", () => {
  it("lets packagings be defined for an active product only", () => {
    expect(mayDefinePackagingsFor({ active: true })).toBe(true);
    expect(mayDefinePackagingsFor({ active: false })).toBe(false);
  });
});
