import { ENROLLMENT_CODE_LENGTH, isWellFormedEnrollmentCode } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { generateSecretCode, hashSecretCode } from "../platform/secret-code.js";
import { registerEnrollmentCodeMatches } from "./register-enrollment-code.js";

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
