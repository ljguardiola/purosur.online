import { describe, expect, it } from "vitest";
import { hashRecoveryToken } from "./recovery-token-hash.js";

describe("hashRecoveryToken", () => {
  it("hashes the same raw token to the same value", () => {
    expect(hashRecoveryToken("a-raw-token")).toBe(hashRecoveryToken("a-raw-token"));
  });

  it("hashes different raw tokens to different values", () => {
    expect(hashRecoveryToken("a-raw-token")).not.toBe(hashRecoveryToken("another-raw-token"));
  });

  it("never returns the raw token itself", () => {
    expect(hashRecoveryToken("a-raw-token")).not.toBe("a-raw-token");
  });
});
