import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  afterFailedAttempt,
  EVENT_APPLICATION_MAX_ATTEMPTS,
  retryDelayMs,
} from "./event-application-retry.js";

const FAILED_AT = new Date("2026-10-07T12:00:00.000Z");
const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;

describe("how long to wait before applying a failed event again", () => {
  it("waits 30 seconds after the first failure and doubles after each next one", () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelayMs)).toEqual(
      [30, 60, 120, 240, 480, 960].map((seconds) => seconds * SECOND_MS),
    );
  });

  it("never waits more than an hour", () => {
    expect(retryDelayMs(8)).toBe(HOUR_MS);
    expect(retryDelayMs(1000)).toBe(HOUR_MS);
  });

  it("never waits less after one more failure, nor more than an hour", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (attempts) => {
        expect(retryDelayMs(attempts + 1)).toBeGreaterThanOrEqual(retryDelayMs(attempts));
        expect(retryDelayMs(attempts)).toBeLessThanOrEqual(HOUR_MS);
        expect(retryDelayMs(attempts)).toBeGreaterThanOrEqual(30 * SECOND_MS);
      }),
    );
  });
});

describe("what happens to an event after a failed attempt to apply it", () => {
  it("gives up after 8 attempts", () => {
    expect(EVENT_APPLICATION_MAX_ATTEMPTS).toBe(8);
  });

  it("tries again after the delay of its attempt, counted from the failure", () => {
    expect(afterFailedAttempt(1, FAILED_AT)).toEqual({
      kind: "retry",
      at: new Date("2026-10-07T12:00:30.000Z"),
    });
    expect(afterFailedAttempt(3, FAILED_AT)).toEqual({
      kind: "retry",
      at: new Date("2026-10-07T12:02:00.000Z"),
    });
  });

  it("tries again after the last attempt still allowed to fail", () => {
    expect(afterFailedAttempt(7, FAILED_AT)).toEqual({
      kind: "retry",
      at: new Date(FAILED_AT.getTime() + 1920 * SECOND_MS),
    });
  });

  it("is quarantined once its attempts reach the maximum", () => {
    expect(afterFailedAttempt(8, FAILED_AT)).toEqual({ kind: "quarantine" });
    expect(afterFailedAttempt(9, FAILED_AT)).toEqual({ kind: "quarantine" });
  });

  it("does not move the instant it was given", () => {
    const failedAt = new Date(FAILED_AT);
    afterFailedAttempt(1, failedAt);

    expect(failedAt).toEqual(FAILED_AT);
  });
});
