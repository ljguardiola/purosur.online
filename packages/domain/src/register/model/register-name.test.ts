import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isRegisterNameTooLong,
  REGISTER_NAME_MAX_LENGTH,
  registerNameLength,
} from "./register-name.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("REGISTER_NAME_MAX_LENGTH", () => {
  it("allows register names of up to 100 characters", () => {
    expect(REGISTER_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("registerNameLength", () => {
  it("counts each letter as one character", () => {
    expect(registerNameLength("Caja 1")).toBe(6);
  });

  it("counts each emoji as one character", () => {
    expect(registerNameLength("🏪".repeat(3))).toBe(3);
  });
});

describe("isRegisterNameTooLong", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(isRegisterNameTooLong("a".repeat(REGISTER_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 101 characters", () => {
    expect(isRegisterNameTooLong("a".repeat(REGISTER_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(isRegisterNameTooLong("🏪".repeat(REGISTER_NAME_MAX_LENGTH))).toBe(false);
    expect(isRegisterNameTooLong("🏪".repeat(REGISTER_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the name's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const name = codePoints.join("");
        expect(registerNameLength(name)).toBe(codePoints.length);
        expect(isRegisterNameTooLong(name)).toBe(codePoints.length > REGISTER_NAME_MAX_LENGTH);
      }),
    );
  });
});
