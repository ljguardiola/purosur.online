import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BRAND_NAME_MAX_LENGTH, brandNameLength, isBrandNameTooLong } from "./brand-name.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("BRAND_NAME_MAX_LENGTH", () => {
  it("allows brand names of up to 100 characters", () => {
    expect(BRAND_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("brandNameLength", () => {
  it("counts each letter as one character", () => {
    expect(brandNameLength("Granix")).toBe(6);
  });

  it("counts each emoji as one character", () => {
    expect(brandNameLength("🌱".repeat(3))).toBe(3);
    expect(brandNameLength("Dulcor 🌱")).toBe(8);
  });
});

describe("isBrandNameTooLong", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(isBrandNameTooLong("a".repeat(BRAND_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 101 characters", () => {
    expect(isBrandNameTooLong("a".repeat(BRAND_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(isBrandNameTooLong("🌱".repeat(BRAND_NAME_MAX_LENGTH))).toBe(false);
    expect(isBrandNameTooLong("🌱".repeat(BRAND_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the name's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const name = codePoints.join("");
        expect(brandNameLength(name)).toBe(codePoints.length);
        expect(isBrandNameTooLong(name)).toBe(codePoints.length > BRAND_NAME_MAX_LENGTH);
      }),
    );
  });
});
