import { describe, expect, test } from "vitest";
import { packageCountOf, quantityPerPackageOf } from "./package-count-form";

describe("packageCountOf", () => {
  test("reads a whole number", () => {
    expect(packageCountOf("12")).toBe(12);
  });

  test.each(["", "abc", "1,5"])("is not a number for %j", (typed) => {
    expect(packageCountOf(typed)).toBeNaN();
  });
});

describe("quantityPerPackageOf", () => {
  test("reads whole units for a product sold by unit", () => {
    expect(quantityPerPackageOf("12", "UNIT")).toBe(12_000);
  });

  test("reads kilos with decimals for a product sold by weight", () => {
    expect(quantityPerPackageOf("25,5", "KG")).toBe(25_500);
  });

  test("is not a number for text that is no quantity", () => {
    expect(quantityPerPackageOf("", "KG")).toBeNaN();
    expect(quantityPerPackageOf("1,5", "UNIT")).toBeNaN();
  });
});
