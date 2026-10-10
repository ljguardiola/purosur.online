import { describe, expect, it } from "vitest";
import { registerHoldsOfflineAuthorizationCode } from "./offline-authorization-code-holding.js";

describe("registerHoldsOfflineAuthorizationCode", () => {
  it("holds when the register's last pull reached the change that published the code", () => {
    expect(registerHoldsOfflineAuthorizationCode({ lastPullSince: 42, codeChangeSeq: 42 })).toBe(
      true,
    );
    expect(registerHoldsOfflineAuthorizationCode({ lastPullSince: 43, codeChangeSeq: 42 })).toBe(
      true,
    );
  });

  it("does not hold when the register's last pull stopped before the change that published the code", () => {
    expect(registerHoldsOfflineAuthorizationCode({ lastPullSince: 41, codeChangeSeq: 42 })).toBe(
      false,
    );
  });

  it("does not hold when the register never pulled", () => {
    expect(registerHoldsOfflineAuthorizationCode({ lastPullSince: null, codeChangeSeq: 42 })).toBe(
      false,
    );
  });

  it("does not hold when the cloud has published no code", () => {
    expect(registerHoldsOfflineAuthorizationCode({ lastPullSince: 42, codeChangeSeq: null })).toBe(
      false,
    );
    expect(registerHoldsOfflineAuthorizationCode({ lastPullSince: 0, codeChangeSeq: null })).toBe(
      false,
    );
  });
});
