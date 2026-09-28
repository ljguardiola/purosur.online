import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { codePointLength } from "./code-point-length.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("codePointLength", () => {
  it("counts an emoji outside the Basic Multilingual Plane once", () => {
    expect(codePointLength("a😀")).toBe(2);
  });

  it("counts each regional indicator of a flag as its own code point", () => {
    expect(codePointLength("🇦🇷")).toBe(2);
  });

  it("counts exactly the code points a string was built from, for any mix including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 200 }), (codePoints) => {
        expect(codePointLength(codePoints.join(""))).toBe(codePoints.length);
      }),
    );
  });
});
