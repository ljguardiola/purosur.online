import { isWellFormedPinCode } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { hashSecretCode } from "../platform/secret-code.js";
import { generatePinCode } from "./pin-code-generator.js";

describe("generatePinCode", () => {
  it("generates a well-formed PIN code", () => {
    expect(isWellFormedPinCode(generatePinCode().code)).toBe(true);
  });

  it("generates a fresh code every call", () => {
    expect(generatePinCode().code).not.toBe(generatePinCode().code);
  });

  it("hands back the hash of the code it generated, never the code", () => {
    const { code, codeHash } = generatePinCode();

    expect(codeHash).toBe(hashSecretCode(code));
    expect(codeHash).not.toBe(code);
  });
});
