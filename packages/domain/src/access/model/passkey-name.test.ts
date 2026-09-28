import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isPasskeyNameTooLong,
  PASSKEY_NAME_MAX_LENGTH,
  passkeyNameLength,
} from "./passkey-name.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("PASSKEY_NAME_MAX_LENGTH", () => {
  it("allows passkey names of up to 40 characters", () => {
    expect(PASSKEY_NAME_MAX_LENGTH).toBe(40);
  });
});

describe("passkeyNameLength", () => {
  it("counts each letter as one character", () => {
    expect(passkeyNameLength("Mi llave")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(passkeyNameLength("🔑".repeat(3))).toBe(3);
  });
});

describe("isPasskeyNameTooLong", () => {
  it("accepts a name of exactly 40 characters", () => {
    expect(isPasskeyNameTooLong("a".repeat(PASSKEY_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 41 characters", () => {
    expect(isPasskeyNameTooLong("a".repeat(PASSKEY_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 40-character limit", () => {
    expect(isPasskeyNameTooLong("🔑".repeat(PASSKEY_NAME_MAX_LENGTH))).toBe(false);
    expect(isPasskeyNameTooLong("🔑".repeat(PASSKEY_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("is true exactly when the name's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 100 }), (codePoints) => {
        const name = codePoints.join("");
        expect(passkeyNameLength(name)).toBe(codePoints.length);
        expect(isPasskeyNameTooLong(name)).toBe(codePoints.length > PASSKEY_NAME_MAX_LENGTH);
      }),
    );
  });
});
