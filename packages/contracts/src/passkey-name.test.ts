import { describe, expect, it } from "vitest";
import { isPasskeyNameTooLong, PASSKEY_NAME_MAX_LENGTH, passkeyNameLength } from "./passkey-name.js";

describe("PASSKEY_NAME_MAX_LENGTH", () => {
  it("allows passkey names of up to 40 characters", () => {
    expect(PASSKEY_NAME_MAX_LENGTH).toBe(40);
  });
});

describe("passkeyNameLength", () => {
  it("counts each letter as one character", () => {
    expect(passkeyNameLength("Mi llave")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(passkeyNameLength("🔑".repeat(3))).toBe(3);
  });
});

describe("isPasskeyNameTooLong", () => {
  it("accepts a name of exactly 40 characters", () => {
    expect(isPasskeyNameTooLong("a".repeat(PASSKEY_NAME_MAX_LENGTH))).toBe(false);
  });

  it("rejects a name of 41 characters", () => {
    expect(isPasskeyNameTooLong("a".repeat(PASSKEY_NAME_MAX_LENGTH + 1))).toBe(true);
  });

  it("counts each emoji as one character toward the 40-character limit", () => {
    expect(isPasskeyNameTooLong("🔑".repeat(PASSKEY_NAME_MAX_LENGTH))).toBe(false);
    expect(isPasskeyNameTooLong("🔑".repeat(PASSKEY_NAME_MAX_LENGTH + 1))).toBe(true);
  });
});
