import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_ATTEMPT_LIMIT,
  ENROLLMENT_ATTEMPT_WINDOW_MS,
  enrollmentAttemptRetryAfterSeconds,
  enrollmentAttemptWindowStart,
} from "./enrollment-attempt-limit.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function attemptsMinutesAgo(...minutes: number[]): Date[] {
  return minutes.map(minutesAgo);
}

describe("enrollment attempt limit", () => {
  it("accepts 10 attempts per hour", () => {
    expect(ENROLLMENT_ATTEMPT_LIMIT).toBe(10);
    expect(ENROLLMENT_ATTEMPT_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});

describe("enrollmentAttemptWindowStart", () => {
  it("counts attempts from one hour before now", () => {
    expect(enrollmentAttemptWindowStart(NOW)).toEqual(minutesAgo(60));
  });
});

describe("enrollmentAttemptRetryAfterSeconds", () => {
  it("accepts an attempt while fewer than 10 were accepted in the last hour", () => {
    const nine = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9);

    expect(enrollmentAttemptRetryAfterSeconds(nine, NOW)).toBeUndefined();
  });

  it("refuses an attempt once 10 were accepted in the last hour, until the oldest leaves the hour", () => {
    const ten = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9, 50);

    expect(enrollmentAttemptRetryAfterSeconds(ten, NOW)).toBe(10 * 60);
  });

  it("waits for the tenth newest attempt when more than 10 are counted, in any order", () => {
    const eleven = attemptsMinutesAgo(59, 1, 2, 3, 4, 5, 6, 7, 8, 9, 40);

    expect(enrollmentAttemptRetryAfterSeconds(eleven, NOW)).toBe(20 * 60);
  });

  it("rounds a partial second of waiting up to a whole second", () => {
    const ten = [
      ...attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9),
      new Date(minutesAgo(60).getTime() + 1),
    ];

    expect(enrollmentAttemptRetryAfterSeconds(ten, NOW)).toBe(1);
  });

  it("ignores attempts from before the last hour", () => {
    const tenWithOneStale = attemptsMinutesAgo(1, 2, 3, 4, 5, 6, 7, 8, 9, 60);

    expect(enrollmentAttemptRetryAfterSeconds(tenWithOneStale, NOW)).toBeUndefined();
  });
});
