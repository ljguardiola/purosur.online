import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import {
  isCostPaid,
  isPackageCount,
  ONE_SALE_UNIT_QUANTITY,
  packagedQuantity,
} from "./purchase-line.js";

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
