import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isTagNameTooLong, TAG_NAME_MAX_LENGTH, tagNameLength } from "./tag-name.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("TAG_NAME_MAX_LENGTH", () => {
  it("allows tag names of up to 100 characters", () => {
    expect(TAG_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("tagNameLength", () => {
  it("counts each letter as one character", () => {
    expect(tagNameLength("Sin TACC")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(tagNameLength("🌱".repeat(3))).toBe(3);
    expect(tagNameLength("Vegano 🌱")).toBe(8);
  });
});

describe("isTagNameTooLong", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(isTagNameTooLong("a".repeat(TAG_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 101 characters", () => {
    expect(isTagNameTooLong("a".repeat(TAG_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(isTagNameTooLong("🌱".repeat(TAG_NAME_MAX_LENGTH))).toBe(false);
    expect(isTagNameTooLong("🌱".repeat(TAG_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the name's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const name = codePoints.join("");
        expect(tagNameLength(name)).toBe(codePoints.length);
        expect(isTagNameTooLong(name)).toBe(codePoints.length > TAG_NAME_MAX_LENGTH);
      }),
    );
  });
});
