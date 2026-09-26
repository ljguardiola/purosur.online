import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  base32Encode,
  generateRegisterEnrollmentCode,
  hashRegisterEnrollmentCode,
  REGISTER_ENROLLMENT_CODE_LENGTH,
} from "./register-enrollment-code.js";

const BASE32_CHARACTER_PATTERN = /^[A-Z2-7]+$/;

describe("base32Encode", () => {
  it("matches the RFC 4648 test vector for a length already a multiple of 5 bits", () => {
    // "fooba" is 5 bytes (40 bits), so it encodes to exactly 8 base32 characters with no padding.
    expect(base32Encode(Buffer.from("fooba"))).toBe("MZXW6YTB");
  });

  it("uppercases every character of the RFC 4648 alphabet, never padding with '='", () => {
    const encoded = base32Encode(Buffer.from("foobar"));

    expect(encoded).not.toContain("=");
    expect(encoded).toMatch(BASE32_CHARACTER_PATTERN);
  });
});

describe("generateRegisterEnrollmentCode", () => {
  it("generates a fresh, unguessable code on every call", () => {
    const first = generateRegisterEnrollmentCode();
    const second = generateRegisterEnrollmentCode();

    expect(first).not.toBe(second);
  });

  it("generates exactly 16 base32 characters, carrying 80 bits (10 bytes) of CSPRNG entropy", () => {
    const code = generateRegisterEnrollmentCode();

    // 16 base32 characters * 5 bits/character = 80 bits, RFC 4648's exact encoding of 10 bytes
    // with no padding, since 80 is already a multiple of 5.
    expect(REGISTER_ENROLLMENT_CODE_LENGTH).toBe(16);
    expect(code).toHaveLength(REGISTER_ENROLLMENT_CODE_LENGTH);
    expect(code).toMatch(BASE32_CHARACTER_PATTERN);
  });
});

describe("hashRegisterEnrollmentCode", () => {
  it("hashes the raw code with SHA-256, base64url-encoded", () => {
    expect(hashRegisterEnrollmentCode("ABCDEFGHIJKLMNOP")).toBe(
      createHash("sha256").update("ABCDEFGHIJKLMNOP").digest("base64url"),
    );
  });

  it("hashes the same input identically every time", () => {
    const code = generateRegisterEnrollmentCode();

    expect(hashRegisterEnrollmentCode(code)).toBe(hashRegisterEnrollmentCode(code));
  });

  it("never equals the raw code it hashes", () => {
    const code = generateRegisterEnrollmentCode();

    expect(hashRegisterEnrollmentCode(code)).not.toBe(code);
  });
});
