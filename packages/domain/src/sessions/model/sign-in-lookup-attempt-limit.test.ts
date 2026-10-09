import { describe, expect, it } from "vitest";
import {
  SIGN_IN_LOOKUP_ATTEMPT_LIMIT,
  SIGN_IN_LOOKUP_ATTEMPT_WINDOW_MS,
  signInLookupAttemptRetryAfterSeconds,
  signInLookupAttemptWindowStart,
} from "./sign-in-lookup-attempt-limit.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function attemptsMinutesAgo(...minutes: number[]): Date[] {
  return minutes.map(minutesAgo);
}

describe("sign-in lookup attempt limit", () => {
  it("accepts 10 lookups per hour", () => {
    expect(SIGN_IN_LOOKUP_ATTEMPT_LIMIT).toBe(10);
    expect(SIGN_IN_LOOKUP_ATTEMPT_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

describe("signInLookupAttemptWindowStart", () => {
  it("counts attempts from one hour before now", () => {
    expect(signInLookupAttemptWindowStart(NOW)).toEqual(minutesAgo(60));
  });
});

describe("signInLookupAttemptRetryAfterSeconds", () => {
  it("accepts an attempt while fewer than 10 were accepted in the last hour", () => {
    const nine = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9);

    expect(signInLookupAttemptRetryAfterSeconds(nine, NOW)).toBeUndefined();
  });

  it("refuses an attempt once 10 were accepted in the last hour, until the oldest leaves the hour", () => {
    const ten = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9, 50);

    expect(signInLookupAttemptRetryAfterSeconds(ten, NOW)).toBe(10 * 60);
  });

  it("waits for the tenth newest attempt when more than 10 are counted, in any order", () => {
    const eleven = attemptsMinutesAgo(59, 1, 2, 3, 4, 5, 6, 7, 8, 9, 40);

    expect(signInLookupAttemptRetryAfterSeconds(eleven, NOW)).toBe(20 * 60);
  });

  it("rounds a partial second of waiting up to a whole second", () => {
    const ten = [
      ...attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9),
      new Date(minutesAgo(60).getTime() + 1),
    ];

    expect(signInLookupAttemptRetryAfterSeconds(ten, NOW)).toBe(1);
  });

  it("ignores attempts from before the last hour", () => {
    const tenWithOneStale = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9, 60);

    expect(signInLookupAttemptRetryAfterSeconds(tenWithOneStale, NOW)).toBeUndefined();
  });
});
