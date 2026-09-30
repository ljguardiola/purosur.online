import { createHash } from "node:crypto";
import { ENROLLMENT_CODE_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  generateRegisterEnrollmentCode,
  hashRegisterEnrollmentCode,
  registerEnrollmentCodeMatches,
} from "./register-enrollment-code.js";

const BASE32_CHARACTER_PATTERN = /^[A-Z2-7]+$/;

describe("generateRegisterEnrollmentCode", () => {
  it("generates a fresh, unguessable code on every call", () => {
    const first = generateRegisterEnrollmentCode();
    const second = generateRegisterEnrollmentCode();

    expect(first).not.toBe(second);
  });

  it("generates exactly 16 base32 characters, carrying 80 bits (10 bytes) of CSPRNG entropy", () => {
    const code = generateRegisterEnrollmentCode();

    expect(ENROLLMENT_CODE_LENGTH).toBe(16);
    expect(code).toHaveLength(ENROLLMENT_CODE_LENGTH);
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

describe("registerEnrollmentCodeMatches", () => {
  it("matches a code against the hash stored for it", () => {
    const code = generateRegisterEnrollmentCode();

    expect(registerEnrollmentCodeMatches(code, hashRegisterEnrollmentCode(code))).toBe(true);
  });

  it("refuses a code that differs from the one whose hash is stored", () => {
    const code = generateRegisterEnrollmentCode();
    const other = `${code.slice(0, 15)}${code.endsWith("A") ? "B" : "A"}`;

    expect(registerEnrollmentCodeMatches(other, hashRegisterEnrollmentCode(code))).toBe(false);
  });

  it("refuses a stored hash that is not a hash of any code", () => {
    expect(registerEnrollmentCodeMatches(generateRegisterEnrollmentCode(), "")).toBe(false);
  });
});
