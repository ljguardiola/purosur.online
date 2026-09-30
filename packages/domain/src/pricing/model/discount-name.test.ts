import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DISCOUNT_NAME_MAX_LENGTH,
  discountNameLength,
  isDiscountNameTooLong,
} from "./discount-name.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("DISCOUNT_NAME_MAX_LENGTH", () => {
  it("allows discount names of up to 100 characters", () => {
    expect(DISCOUNT_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("discountNameLength", () => {
  it("counts each emoji as one character", () => {
    expect(discountNameLength("Verano 🌞")).toBe(8);
  });
});

describe("isDiscountNameTooLong", () => {
  it("accepts a name of exactly 100 characters and rejects one of 101", () => {
    expect(isDiscountNameTooLong("a".repeat(DISCOUNT_NAME_MAX_LENGTH))).toBe(false);
    expect(isDiscountNameTooLong("a".repeat(DISCOUNT_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the limit", () => {
    expect(isDiscountNameTooLong("🌞".repeat(DISCOUNT_NAME_MAX_LENGTH))).toBe(false);
    expect(isDiscountNameTooLong("🌞".repeat(DISCOUNT_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the code point count exceeds the limit, for any mix of code points", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const name = codePoints.join("");
        expect(discountNameLength(name)).toBe(codePoints.length);
        expect(isDiscountNameTooLong(name)).toBe(codePoints.length > DISCOUNT_NAME_MAX_LENGTH);
      }),
    );
  });
});
