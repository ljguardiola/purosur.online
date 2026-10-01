import { ENROLLMENT_CODE_LENGTH, isWellFormedEnrollmentCode } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { generateSecretCode, hashSecretCode } from "../platform/secret-code.js";
import {
  registerEnrollmentCodeMatches,
  secretEnrollmentCodes,
} from "./register-enrollment-code.js";

describe("the enrollment code the cloud generates", () => {
  it("is a well-formed enrollment code", () => {
    const code = generateSecretCode();

    expect(code).toHaveLength(ENROLLMENT_CODE_LENGTH);
    expect(isWellFormedEnrollmentCode(code)).toBe(true);
  });
});

describe("registerEnrollmentCodeMatches", () => {
  it("matches a code against the hash stored for it", () => {
    const code = generateSecretCode();

    expect(registerEnrollmentCodeMatches(code, hashSecretCode(code))).toBe(true);
  });

  it("refuses a code that differs from the one whose hash is stored", () => {
    const code = generateSecretCode();
    const other = `${code.slice(0, 15)}${code.endsWith("A") ? "B" : "A"}`;

    expect(registerEnrollmentCodeMatches(other, hashSecretCode(code))).toBe(false);
  });

  it("refuses a stored hash that is not a hash of any code", () => {
    expect(registerEnrollmentCodeMatches(generateSecretCode(), "")).toBe(false);
  });
});

describe("secretEnrollmentCodes", () => {
  it("issues a well-formed code together with the hash its match is checked against", () => {
    const issued = secretEnrollmentCodes.issue();

    expect(isWellFormedEnrollmentCode(issued.code)).toBe(true);
    expect(registerEnrollmentCodeMatches(issued.code, issued.codeHash)).toBe(true);
  });

  it("issues a different code each time", () => {
    expect(secretEnrollmentCodes.issue().code).not.toBe(secretEnrollmentCodes.issue().code);
  });
});
