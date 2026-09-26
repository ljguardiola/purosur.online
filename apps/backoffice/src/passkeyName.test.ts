import { describe, expect, it } from "vitest";
import { validatePasskeyName } from "./passkeyName";

describe("validatePasskeyName", () => {
  const errors = {
    required: "required",
    tooLong: "too long",
  };

  it("requires a name, rejecting a blank one", () => {
    expect(validatePasskeyName("", errors)).toBe("required");
  });

  it("requires a name, rejecting a whitespace-only one", () => {
    expect(validatePasskeyName("   ", errors)).toBe("required");
  });

  it("rejects a name of 41 characters", () => {
    expect(validatePasskeyName("a".repeat(41), errors)).toBe("too long");
  });

  it("accepts a 40-character name surrounded by spaces, trimmed before the limit applies", () => {
    expect(validatePasskeyName(`  ${"a".repeat(40)}  `, errors)).toBeUndefined();
  });

  it("accepts an ordinary name", () => {
    expect(validatePasskeyName("Caja principal", errors)).toBeUndefined();
  });

  it("counts each emoji as one character toward the 40-character limit", () => {
    expect(validatePasskeyName("🔑".repeat(40), errors)).toBeUndefined();
  });
});
