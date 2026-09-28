import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNameLength,
  isCategoryNameTooLong,
} from "./category-name.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("CATEGORY_NAME_MAX_LENGTH", () => {
  it("allows category names of up to 100 characters", () => {
    expect(CATEGORY_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("categoryNameLength", () => {
  it("counts each letter as one character", () => {
    expect(categoryNameLength("Semillas")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(categoryNameLength("🌱".repeat(3))).toBe(3);
    expect(categoryNameLength("Café 🌱")).toBe(6);
  });
});

describe("isCategoryNameTooLong", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(isCategoryNameTooLong("a".repeat(CATEGORY_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 101 characters", () => {
    expect(isCategoryNameTooLong("a".repeat(CATEGORY_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(isCategoryNameTooLong("🌱".repeat(CATEGORY_NAME_MAX_LENGTH))).toBe(false);
    expect(isCategoryNameTooLong("🌱".repeat(CATEGORY_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the name's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const name = codePoints.join("");
        expect(categoryNameLength(name)).toBe(codePoints.length);
        expect(isCategoryNameTooLong(name)).toBe(codePoints.length > CATEGORY_NAME_MAX_LENGTH);
      }),
    );
  });
});
