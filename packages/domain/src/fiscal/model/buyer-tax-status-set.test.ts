import { describe, expect, it } from "vitest";
import {
  isSameBuyerTaxStatusSet,
  isValidBuyerTaxStatusSet,
  latestBuyerTaxStatusSet,
} from "./buyer-tax-status-set.js";

const a = { code: 901, description: "Condicion de prueba A", invoiceClass: "A" };
const b = { code: 902, description: "Condicion de prueba B", invoiceClass: "B, C" };

describe("isValidBuyerTaxStatusSet", () => {
  it("accepts options with distinct codes", () => {
    expect(isValidBuyerTaxStatusSet([a, b])).toBe(true);
  });

  it("refuses an empty set", () => {
    expect(isValidBuyerTaxStatusSet([])).toBe(false);
  });

  it("refuses two options with the same code, even if they read differently", () => {
    expect(isValidBuyerTaxStatusSet([a, { ...b, code: 901 }])).toBe(false);
  });
});

describe("isSameBuyerTaxStatusSet", () => {
  it("holds for the same options in another order", () => {
    expect(isSameBuyerTaxStatusSet([a, b], [b, a])).toBe(true);
  });

  it.each([
    ["a missing option", [a]],
    ["an added option", [a, b, { code: 903, description: "x", invoiceClass: "A" }]],
    ["another code", [a, { ...b, code: 903 }]],
    ["another description", [a, { ...b, description: "Otra" }]],
    ["another invoice class", [a, { ...b, invoiceClass: "A" }]],
  ])("does not hold with %s", (_case, other) => {
    expect(isSameBuyerTaxStatusSet([a, b], other)).toBe(false);
  });

  it("does not hold when the same options are repeated a different number of times", () => {
    expect(isSameBuyerTaxStatusSet([a, a, b], [a, b, b])).toBe(false);
  });
});

describe("latestBuyerTaxStatusSet", () => {
  it("answers the set with the highest params version, whatever the order", () => {
    const [first, second, third] = [
      { paramsVersion: 1 },
      { paramsVersion: 2 },
      { paramsVersion: 3 },
    ];
    expect(latestBuyerTaxStatusSet([second, third, first])).toBe(third);
    expect(latestBuyerTaxStatusSet([third, first])).toBe(third);
  });

  it("answers nothing when no set was delivered", () => {
    expect(latestBuyerTaxStatusSet([])).toBeUndefined();
  });
});
