import { describe, expect, it } from "vitest";
import {
  isWsaaTokenDueForRenewal,
  isWsaaTokenRetryDue,
  isWsaaTokenValid,
  WSAA_ALREADY_AUTHENTICATED_RETRY_MS,
} from "./wsaa-token.js";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-10-01T12:00:00.000Z");
const expiringIn = (ms: number) => ({ expiresAt: new Date(NOW.getTime() + ms) });

describe("isWsaaTokenValid", () => {
  it("is true while now is before the expiry", () => {
    expect(isWsaaTokenValid(expiringIn(1), NOW)).toBe(true);
  });

  it("is false at the expiry instant", () => {
    expect(isWsaaTokenValid(expiringIn(0), NOW)).toBe(false);
  });

  it("is false after the expiry", () => {
    expect(isWsaaTokenValid(expiringIn(-1), NOW)).toBe(false);
  });
});

describe("isWsaaTokenDueForRenewal", () => {
  it("is due when there is no token", () => {
    expect(isWsaaTokenDueForRenewal(null, NOW)).toBe(true);
  });

  it("is not due while the token is still valid, however little time remains", () => {
    expect(isWsaaTokenDueForRenewal(expiringIn(1), NOW)).toBe(false);
  });

  it("is due at the expiry instant", () => {
    expect(isWsaaTokenDueForRenewal(expiringIn(0), NOW)).toBe(true);
  });

  it("is due once the token expired", () => {
    expect(isWsaaTokenDueForRenewal(expiringIn(-HOUR_MS), NOW)).toBe(true);
  });
});

describe("WSAA_ALREADY_AUTHENTICATED_RETRY_MS", () => {
  it("is ten minutes", () => {
    expect(WSAA_ALREADY_AUTHENTICATED_RETRY_MS).toBe(10 * 60 * 1000);
  });
});

describe("isWsaaTokenRetryDue", () => {
  const refusedAgo = (ms: number) => new Date(NOW.getTime() - ms);

  it("is due when WSAA never refused", () => {
    expect(isWsaaTokenRetryDue(null, NOW)).toBe(true);
  });

  it("is not due just before the retry interval has passed", () => {
    expect(isWsaaTokenRetryDue(refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS - 1), NOW)).toBe(
      false,
    );
  });

  it("is due exactly when the retry interval has passed", () => {
    expect(isWsaaTokenRetryDue(refusedAgo(WSAA_ALREADY_AUTHENTICATED_RETRY_MS), NOW)).toBe(true);
  });

  it("is due long after the refusal", () => {
    expect(isWsaaTokenRetryDue(refusedAgo(HOUR_MS), NOW)).toBe(true);
  });
});
