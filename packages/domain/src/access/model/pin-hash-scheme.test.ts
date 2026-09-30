import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodePinSalt, encodePinHash } from "./pin-hash-scheme.js";

describe("encodePinHash", () => {
  it("writes bytes in the URL-safe alphabet, without padding", () => {
    expect(encodePinHash(Uint8Array.of(0xfb, 0xff))).toBe("-_8");
    expect(encodePinHash(Uint8Array.of(0x01, 0x02, 0x03, 0x04))).toBe("AQIDBA");
  });

  it("writes 32 bytes as 43 characters", () => {
    expect(encodePinHash(new Uint8Array(32).fill(0xff))).toHaveLength(43);
  });
});

describe("decodePinSalt", () => {
  it("reads back the 16 bytes a salt was written from", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        expect(decodePinSalt(encodePinHash(bytes))).toEqual(bytes);
      }),
    );
  });

  it("refuses a salt of any other length", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 40 }).filter((bytes) => bytes.length !== 16),
        (bytes) => {
          expect(decodePinSalt(encodePinHash(bytes))).toBeUndefined();
        },
      ),
    );
  });

  it.each([
    ["padded", "AQEBAQEBAQEBAQEBAQEBAQ=="],
    ["standard alphabet", "+/+/+/+/+/+/+/+/+/+/+w"],
    ["with a space", "AQEBAQEBAQEBAQEBAQEB A"],
    ["with a line break", "AQEBAQEBAQEBAQEBAQEBAQ\n"],
    ["with spare bits set in its last character", "AQEBAQEBAQEBAQEBAQEBAR"],
    ["empty", ""],
    ["one character past a whole group", "AQEBAQEBAQEBAQEBAQEBA"],
  ])("refuses a salt that is %s", (_case, salt) => {
    expect(decodePinSalt(salt)).toBeUndefined();
  });

  it("accepts the canonical text of 16 identical bytes", () => {
    expect(decodePinSalt("AQEBAQEBAQEBAQEBAQEBAQ")).toEqual(new Uint8Array(16).fill(1));
  });
});
