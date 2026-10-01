import { describe, expect, it } from "vitest";
import {
  hasReachedSignInFailureLimit,
  isSignInBlockLive,
  SIGN_IN_BLOCK_DURATION_MS,
  SIGN_IN_FAILURE_LIMIT,
  SIGN_IN_LOCKOUT_WINDOW_MS,
  signInBlockedUntil,
  signInLockoutWindowStart,
} from "./sign-in-lockout.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");

describe("sign-in lockout", () => {
  it("blocks an address for 15 minutes once it reaches 10 failures within an hour", () => {
    expect(SIGN_IN_FAILURE_LIMIT).toBe(10);
    expect(SIGN_IN_LOCKOUT_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(SIGN_IN_BLOCK_DURATION_MS).toBe(15 * 60 * 1000);
  });
});

describe("signInLockoutWindowStart", () => {
  it("counts failures from one hour before now", () => {
    expect(signInLockoutWindowStart(NOW)).toEqual(new Date("2026-10-01T11:00:00.000Z"));
  });
});

describe("hasReachedSignInFailureLimit", () => {
  it("is not reached with 9 failures", () => {
    expect(hasReachedSignInFailureLimit(9)).toBe(false);
  });

  it("is reached with 10 failures", () => {
    expect(hasReachedSignInFailureLimit(10)).toBe(true);
  });

  it("is reached with more than 10 failures", () => {
    expect(hasReachedSignInFailureLimit(11)).toBe(true);
  });
});

describe("signInBlockedUntil", () => {
  it("blocks until 15 minutes after now", () => {
    expect(signInBlockedUntil(NOW)).toEqual(new Date("2026-10-01T12:15:00.000Z"));
  });
});

describe("isSignInBlockLive", () => {
  it("is live one millisecond before the block ends", () => {
    expect(isSignInBlockLive(new Date(NOW.getTime() + 1), NOW)).toBe(true);
  });

  it("is over exactly when the block ends", () => {
    expect(isSignInBlockLive(NOW, NOW)).toBe(false);
  });

  it("is over after the block ended", () => {
    expect(isSignInBlockLive(new Date(NOW.getTime() - 1), NOW)).toBe(false);
  });
});
