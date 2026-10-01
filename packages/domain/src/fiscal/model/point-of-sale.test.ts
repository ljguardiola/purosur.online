import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isPointOfSaleNumber,
  mayRegisterClaimPointOfSale,
  POINT_OF_SALE_NUMBER_MAX,
} from "./point-of-sale.js";

describe("POINT_OF_SALE_NUMBER_MAX", () => {
  it("is the largest number of five digits", () => {
    expect(POINT_OF_SALE_NUMBER_MAX).toBe(99999);
  });
});

describe("isPointOfSaleNumber", () => {
  it.each([1, 2, 10, 99998, 99999])("accepts %d", (value) => {
    expect(isPointOfSaleNumber(value)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["a negative integer", -1],
    ["the first six-digit number", 100000],
    ["a fraction", 1.5],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_case, value) => {
    expect(isPointOfSaleNumber(value)).toBe(false);
  });

  it("holds exactly for the integers from 1 to 99999", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: -10, max: 100010 }), fc.double()), (value) => {
        expect(isPointOfSaleNumber(value)).toBe(
          Number.isInteger(value) && value >= 1 && value <= 99999,
        );
      }),
    );
  });
});

describe("mayRegisterClaimPointOfSale", () => {
  it("lets a register claim a number nobody holds", () => {
    expect(mayRegisterClaimPointOfSale(undefined, "register-1")).toBe(true);
  });

  it("lets a register claim a number it already holds", () => {
    expect(mayRegisterClaimPointOfSale("register-1", "register-1")).toBe(true);
  });

  it("refuses a register a number another register holds", () => {
    expect(mayRegisterClaimPointOfSale("register-2", "register-1")).toBe(false);
  });
});
