import { describe, expect, it } from "vitest";
import { appendEan13CheckDigit, ean13CheckDigit, ean13Modules, isInternalBarcode } from "./ean13";

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

describe("isInternalBarcode", () => {
  it("recognizes a 20-29 EAN-13 with a valid check digit", () => {
    expect(isInternalBarcode("2000000000015")).toBe(true);
    expect(isInternalBarcode("2912345678906")).toBe(true);
  });

  it("rejects a 20-29 EAN-13 whose check digit is wrong", () => {
    expect(isInternalBarcode("2000000000016")).toBe(false);
  });

  it("rejects a valid EAN-13 outside the 20-29 range", () => {
    expect(isInternalBarcode("7790987000010")).toBe(false);
  });

  it("rejects a code that is not exactly 13 digits", () => {
    expect(isInternalBarcode("200000000001")).toBe(false);
    expect(isInternalBarcode("20000000000155")).toBe(false);
    expect(isInternalBarcode("200000000001a")).toBe(false);
  });
});

describe("ean13Modules", () => {
  it("encodes an internal barcode into its 95-module GS1 bar pattern", () => {
    expect(ean13Modules("2000000000015")).toBe(
      "10100011010001101010011101001110001101010011101010111001011100101110010111001011001101001110101",
    );
  });

  it("encodes a real retail EAN-13 into its 95-module GS1 bar pattern", () => {
    expect(ean13Modules("7791234567898")).toBe(
      "10101110110010111001100100110110111101001110101010100111010100001000100100100011101001001000101",
    );
  });

  it("selects the first digit's L/G parity pattern from the GS1 table", () => {
    expect(ean13Modules("2912345678906")).toBe(
      "10100010110011001001101101000010100011011100101010101000010001001001000111010011100101010000101",
    );
  });
});
