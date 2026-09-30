import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSecretCode, hashSecretCode } from "./secret-code.js";

describe("generateSecretCode", () => {
  it("generates 16 base32 characters, carrying 80 bits of CSPRNG entropy", () => {
    expect(generateSecretCode()).toMatch(/^[A-Z2-7]{16}$/);
  });

  it("generates a fresh code on every call", () => {
    expect(generateSecretCode()).not.toBe(generateSecretCode());
  });
});

describe("hashSecretCode", () => {
  it("hashes the code with SHA-256, base64url-encoded", () => {
    expect(hashSecretCode("ABCDEFGHIJKLMNOP")).toBe(
      createHash("sha256").update("ABCDEFGHIJKLMNOP").digest("base64url"),
    );
  });

  it("hashes the same code identically every time", () => {
    const code = generateSecretCode();

    expect(hashSecretCode(code)).toBe(hashSecretCode(code));
  });

  it("never equals the code it hashes", () => {
    const code = generateSecretCode();

    expect(hashSecretCode(code)).not.toBe(code);
  });
});
