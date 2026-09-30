import { describe, expect, it } from "vitest";
import { base32EncodeUnpadded } from "./base32.js";

const BASE32_CHARACTER_PATTERN = /^[A-Z2-7]+$/;

describe("base32EncodeUnpadded", () => {
  it("matches the RFC 4648 test vector for a length already a multiple of 5 bits", () => {
    expect(base32EncodeUnpadded(Buffer.from("fooba"))).toBe("MZXW6YTB");
  });

  it("uppercases every character of the RFC 4648 alphabet, never padding with '='", () => {
    const encoded = base32EncodeUnpadded(Buffer.from("foobar"));

    expect(encoded).not.toContain("=");
    expect(encoded).toMatch(BASE32_CHARACTER_PATTERN);
  });
});
