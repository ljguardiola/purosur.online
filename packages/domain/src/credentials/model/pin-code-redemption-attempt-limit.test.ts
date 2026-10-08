import { describe, expect, it } from "vitest";
import {
  PIN_CODE_REDEMPTION_ATTEMPT_LIMIT,
  PIN_CODE_REDEMPTION_ATTEMPT_WINDOW_MS,
  pinCodeRedemptionAttemptRetryAfterSeconds,
  pinCodeRedemptionAttemptWindowStart,
} from "./pin-code-redemption-attempt-limit.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function attemptsMinutesAgo(...minutes: number[]): Date[] {
  return minutes.map(minutesAgo);
}

describe("PIN code redemption attempt limit", () => {
  it("accepts 10 attempts per hour", () => {
    expect(PIN_CODE_REDEMPTION_ATTEMPT_LIMIT).toBe(10);
    expect(PIN_CODE_REDEMPTION_ATTEMPT_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

describe("pinCodeRedemptionAttemptWindowStart", () => {
  it("counts attempts from one hour before now", () => {
    expect(pinCodeRedemptionAttemptWindowStart(NOW)).toEqual(minutesAgo(60));
  });
});

describe("pinCodeRedemptionAttemptRetryAfterSeconds", () => {
  it("accepts an attempt while fewer than 10 were accepted in the last hour", () => {
    const nine = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9);

    expect(pinCodeRedemptionAttemptRetryAfterSeconds(nine, NOW)).toBeUndefined();
  });

  it("refuses an attempt once 10 were accepted in the last hour, until the oldest leaves the hour", () => {
    const ten = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9, 50);

    expect(pinCodeRedemptionAttemptRetryAfterSeconds(ten, NOW)).toBe(10 * 60);
  });

  it("waits for the tenth newest attempt when more than 10 are counted, in any order", () => {
    const eleven = attemptsMinutesAgo(59, 1, 2, 3, 4, 5, 6, 7, 8, 9, 40);

    expect(pinCodeRedemptionAttemptRetryAfterSeconds(eleven, NOW)).toBe(20 * 60);
  });

  it("rounds a partial second of waiting up to a whole second", () => {
    const ten = [
      ...attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9),
      new Date(minutesAgo(60).getTime() + 1),
    ];

    expect(pinCodeRedemptionAttemptRetryAfterSeconds(ten, NOW)).toBe(1);
  });

  it("ignores attempts from before the last hour", () => {
    const tenWithOneStale = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9, 60);

    expect(pinCodeRedemptionAttemptRetryAfterSeconds(tenWithOneStale, NOW)).toBeUndefined();
  });
});
