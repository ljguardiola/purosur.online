import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generatePinCode, hashPinCode } from "./pin-code-generator.js";

describe("generatePinCode", () => {
  it("generates 16 base32 characters, carrying 80 bits of CSPRNG entropy", () => {
    expect(generatePinCode().code).toMatch(/^[A-Z2-7]{16}$/);
  });

  it("generates a fresh code every call", () => {
    expect(generatePinCode().code).not.toBe(generatePinCode().code);
  });

  it("hands back the hash of the code it generated, never the code", () => {
    const { code, codeHash } = generatePinCode();

    expect(codeHash).toBe(hashPinCode(code));
    expect(codeHash).not.toBe(code);
  });
});

describe("hashPinCode", () => {
  it("hashes the code with SHA-256, base64url-encoded", () => {
    expect(hashPinCode("ABCDEFGHIJKLMNOP")).toBe(
      createHash("sha256").update("ABCDEFGHIJKLMNOP").digest("base64url"),
    );
  });
});
