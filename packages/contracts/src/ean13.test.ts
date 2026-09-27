import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  appendEan13CheckDigit,
  ean13CheckDigit,
  ean13Modules,
  isInternalBarcode,
} from "./ean13.js";

describe("ean13CheckDigit", () => {
  it("computes the standard GS1 EAN-13 check digit for a 12-digit body", () => {
    expect(ean13CheckDigit("200000000001")).toBe(5);
    expect(ean13CheckDigit("200000000002")).toBe(2);
    expect(ean13CheckDigit("200000000003")).toBe(9);
  });
});

const twelveDigitBody = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 })
  .map((digits) => digits.join(""));

function carriesValidCheckDigit(code: string): boolean {
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

function withDigitsAt(code: string, digits: Record<number, number>): string {
  return [...code].map((digit, index) => String(digits[index] ?? digit)).join("");
}

describe("the EAN-13 check digit", () => {
  it("computes GS1's check digit for a retail EAN-13", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
  });

  it("detects a single mistyped digit anywhere in the code", () => {
    fc.assert(
      fc.property(
        twelveDigitBody,
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 1, max: 9 }),
        (body, position, shift) => {
          const code = appendEan13CheckDigit(body);
          const mistyped = withDigitsAt(code, {
            [position]: (Number(code[position]) + shift) % 10,
          });
          expect(carriesValidCheckDigit(mistyped)).toBe(false);
        },
      ),
    );
  });

  it("detects two swapped neighboring digits unless they differ by exactly 5", () => {
    fc.assert(
      fc.property(twelveDigitBody, fc.integer({ min: 0, max: 11 }), (body, position) => {
        const code = appendEan13CheckDigit(body);
        const first = Number(code[position]);
        const second = Number(code[position + 1]);
        fc.pre(Math.abs(first - second) % 5 !== 0);
        const swapped = withDigitsAt(code, { [position]: second, [position + 1]: first });
        expect(carriesValidCheckDigit(swapped)).toBe(false);
      }),
    );
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
    expect(isInternalBarcode("02912345678906")).toBe(false);
  });
});

const GS1_DIGIT_PATTERNS = [
  ["0", "0001101", "0100111", "1110010"],
  ["1", "0011001", "0110011", "1100110"],
  ["2", "0010011", "0011011", "1101100"],
  ["3", "0111101", "0100001", "1000010"],
  ["4", "0100011", "0011101", "1011100"],
  ["5", "0110001", "0111001", "1001110"],
  ["6", "0101111", "0000101", "1010000"],
  ["7", "0111011", "0010001", "1000100"],
  ["8", "0110111", "0001001", "1001000"],
  ["9", "0001011", "0010111", "1110100"],
] as const;

const GS1_FIRST_DIGIT_PARITY = [
  ["0", "LLLLLL"],
  ["1", "LLGLGG"],
  ["2", "LLGGLG"],
  ["3", "LLGGGL"],
  ["4", "LGLLGG"],
  ["5", "LGGLLG"],
  ["6", "LGGGLL"],
  ["7", "LGLGLG"],
  ["8", "LGLGGL"],
  ["9", "LGGLGL"],
] as const;

function sevenModuleGroups(modules: string): string[] {
  return modules.match(/.{7}/g) ?? [];
}

function leftGroups(modules: string): string[] {
  return sevenModuleGroups(modules.slice(3, 45));
}

function rightGroups(modules: string): string[] {
  return sevenModuleGroups(modules.slice(50, 92));
}

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

  it.each(GS1_DIGIT_PATTERNS)(
    "encodes %s with GS1's L pattern %s, G pattern %s and R pattern %s",
    (digit, leftOdd, leftEven, right) => {
      const modules = ean13Modules(`1${digit.repeat(12)}`);
      expect(leftGroups(modules)).toEqual([
        leftOdd,
        leftOdd,
        leftEven,
        leftOdd,
        leftEven,
        leftEven,
      ]);
      expect(rightGroups(modules)).toEqual(Array(6).fill(right));
    },
  );

  it.each(GS1_FIRST_DIGIT_PARITY)(
    "encodes the left half of a code starting with %s under GS1's %s parity",
    (firstDigit, parity) => {
      const modules = ean13Modules(`${firstDigit}${"0".repeat(12)}`);
      expect(leftGroups(modules)).toEqual(
        [...parity].map((set) => (set === "L" ? "0001101" : "0100111")),
      );
    },
  );
});
