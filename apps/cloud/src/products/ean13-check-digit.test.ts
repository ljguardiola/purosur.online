import { describe, expect, it } from "vitest";
import { appendEan13CheckDigit, ean13CheckDigit } from "./ean13-check-digit.js";

describe("ean13CheckDigit", () => {
  it("computes the standard GS1 EAN-13 check digit for a 12-digit body", () => {
    expect(ean13CheckDigit("200000000001")).toBe(5);
    expect(ean13CheckDigit("200000000002")).toBe(2);
    expect(ean13CheckDigit("200000000003")).toBe(9);
  });
});

describe("appendEan13CheckDigit", () => {
  it("appends the computed check digit to the 12-digit body", () => {
    expect(appendEan13CheckDigit("200000000001")).toBe("2000000000015");
    expect(appendEan13CheckDigit("200000000002")).toBe("2000000000022");
    expect(appendEan13CheckDigit("200000000003")).toBe("2000000000039");
  });
});
