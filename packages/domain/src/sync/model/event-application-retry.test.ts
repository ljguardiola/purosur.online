import { describe, expect, it } from "vitest";
import { afterFailedAttempt } from "./event-application-retry.js";

const FAILED_AT = new Date("2026-10-07T12:00:00.000Z");
const SECOND_MS = 1000;

describe("what happens to an event after a failed attempt to apply it", () => {
  it("tries again 30 seconds after the first failure and waits twice as long after each next one", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7].map((attempts) => afterFailedAttempt(attempts, FAILED_AT)),
    ).toEqual(
      [30, 60, 120, 240, 480, 960, 1920].map((seconds) => ({
        kind: "retry",
        at: new Date(FAILED_AT.getTime() + seconds * SECOND_MS),
      })),
    );
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
