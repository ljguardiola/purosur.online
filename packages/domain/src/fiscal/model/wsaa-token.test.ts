import { describe, expect, it } from "vitest";
import { isWsaaTokenDueForRenewal, isWsaaTokenValid } from "./wsaa-token.js";

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
