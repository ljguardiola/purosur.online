import { describe, expect, it } from "vitest";
import {
  isSessionExpired,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  sessionExpiresAt,
} from "./session-expiry.js";

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function after(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

describe("session timeouts", () => {
  it("ends a session after 30 minutes without activity or 12 hours after it opened", () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * MINUTE);
    expect(SESSION_ABSOLUTE_TIMEOUT_MS).toBe(12 * HOUR);
  });
});

describe("sessionExpiresAt", () => {
  it("expires 30 minutes after the last activity while that is before the 12 hour limit", () => {
    const lastSeenAt = after(CREATED_AT, HOUR);

    expect(sessionExpiresAt({ createdAt: CREATED_AT, lastSeenAt })).toEqual(
      after(lastSeenAt, 30 * MINUTE),
    );
  });

  it("expires 12 hours after it opened when activity would keep it alive past that", () => {
    const lastSeenAt = after(CREATED_AT, 11 * HOUR + 50 * MINUTE);

    expect(sessionExpiresAt({ createdAt: CREATED_AT, lastSeenAt })).toEqual(
      after(CREATED_AT, 12 * HOUR),
    );
  });
});

describe("isSessionExpired", () => {
  it("is open one millisecond before 30 minutes without activity", () => {
    const session = { createdAt: CREATED_AT, lastSeenAt: after(CREATED_AT, HOUR) };

    expect(isSessionExpired(session, after(session.lastSeenAt, 30 * MINUTE - 1))).toBe(false);
  });

  it("is expired exactly 30 minutes after the last activity", () => {
    const session = { createdAt: CREATED_AT, lastSeenAt: after(CREATED_AT, HOUR) };

    expect(isSessionExpired(session, after(session.lastSeenAt, 30 * MINUTE))).toBe(true);
  });

  it("is expired after 30 minutes without activity", () => {
    const session = { createdAt: CREATED_AT, lastSeenAt: after(CREATED_AT, HOUR) };

    expect(isSessionExpired(session, after(session.lastSeenAt, 30 * MINUTE + 1))).toBe(true);
  });

  it("is open one millisecond before 12 hours after it opened, however recent the activity", () => {
    const now = after(CREATED_AT, 12 * HOUR - 1);

    expect(isSessionExpired({ createdAt: CREATED_AT, lastSeenAt: now }, now)).toBe(false);
  });

  it("is expired exactly 12 hours after it opened, however recent the activity", () => {
    const now = after(CREATED_AT, 12 * HOUR);

    expect(isSessionExpired({ createdAt: CREATED_AT, lastSeenAt: now }, now)).toBe(true);
  });

  it("is expired after 12 hours since it opened, however recent the activity", () => {
    const now = after(CREATED_AT, 12 * HOUR + 1);

    expect(isSessionExpired({ createdAt: CREATED_AT, lastSeenAt: now }, now)).toBe(true);
  });
});
