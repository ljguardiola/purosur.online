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
});
