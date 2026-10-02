import { describe, expect, it } from "vitest";
import { pinAttemptRefusalSchema } from "./pin-attempt-refusal.js";

describe("pinAttemptRefusalSchema", () => {
  it.each([
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 30, attempts_left: 1 },
    { kind: "rate_limited", retry_after_seconds: 1, attempts_left: 5 },
    { kind: "rate_limited", retry_after_seconds: 30, attempts_left: 5 },
    { kind: "locked", consecutive_failures: 8 },
  ])("accepts the refusal $kind", (refusal) => {
    expect(pinAttemptRefusalSchema.parse(refusal)).toEqual(refusal);
  });

  it.each([
    { kind: "unavailable" },
    { kind: "wrong_pin" },
    { kind: "wrong_pin", retry_after_seconds: 0 },
    { kind: "wrong_pin", attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: -1, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 31, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 1.5, attempts_left: 7 },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 0 },
    { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 8 },
    { kind: "rate_limited" },
    { kind: "rate_limited", retry_after_seconds: 0, attempts_left: 5 },
    { kind: "rate_limited", retry_after_seconds: 31, attempts_left: 5 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 0 },
    { kind: "rate_limited", retry_after_seconds: 4, attempts_left: 8 },
    { kind: "locked" },
    { kind: "locked", consecutive_failures: 7 },
  ])("refuses what it does not know: %j", (refusal) => {
    expect(pinAttemptRefusalSchema.safeParse(refusal).success).toBe(false);
  });
});
