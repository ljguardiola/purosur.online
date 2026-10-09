import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isLockedOutOfPinSignIn,
  PIN_SIGN_IN_LOCKOUT_FAILURES,
  PIN_SIGN_IN_MAX_DELAY_SECONDS,
  pinSignInAttemptsLeft,
  pinSignInDelaySeconds,
  pinSignInRetryAfterSeconds,
} from "./pin-sign-in-failures.js";

const failures = fc.integer({ min: 0, max: 200 });
const instant = fc.integer({ min: 0, max: 4_000_000_000_000 }).map((ms) => new Date(ms));

describe("pinSignInDelaySeconds", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 1],
    [4, 2],
    [5, 4],
    [6, 8],
    [7, 16],
    [8, 30],
    [9, 30],
  ])("waits %i failures for %i seconds", (count, seconds) => {
    expect(pinSignInDelaySeconds(count)).toBe(seconds);
  });

  it("never waits more than the cap", () => {
    fc.assert(
      fc.property(
        failures,
        (count) => pinSignInDelaySeconds(count) <= PIN_SIGN_IN_MAX_DELAY_SECONDS,
      ),
    );
  });

  it("never shortens as failures pile up", () => {
    fc.assert(
      fc.property(
        failures,
        (count) => pinSignInDelaySeconds(count + 1) >= pinSignInDelaySeconds(count),
      ),
    );
  });

  it("does not delay the first two failures", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), (count) => pinSignInDelaySeconds(count) === 0),
    );
  });

  it("delays every failure from the third on", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 200 }), (count) => pinSignInDelaySeconds(count) > 0),
    );
  });
});

describe("lockout", () => {
  it("locks out exactly from the eighth consecutive failure", () => {
    expect(PIN_SIGN_IN_LOCKOUT_FAILURES).toBe(8);
    expect(isLockedOutOfPinSignIn(7)).toBe(false);
    expect(isLockedOutOfPinSignIn(8)).toBe(true);
  });

  it("is locked out for any count from the lockout on and never before", () => {
    fc.assert(fc.property(failures, (count) => isLockedOutOfPinSignIn(count) === count >= 8));
  });
});

describe("pinSignInAttemptsLeft", () => {
  it.each([
    [0, 8],
    [1, 7],
    [7, 1],
    [8, 0],
    [20, 0],
  ])("leaves %i failures with %i attempts", (count, left) => {
    expect(pinSignInAttemptsLeft(count)).toBe(left);
  });

  it("reaches zero exactly when locked out", () => {
    fc.assert(
      fc.property(
        failures,
        (count) => (pinSignInAttemptsLeft(count) === 0) === isLockedOutOfPinSignIn(count),
      ),
    );
  });
});

describe("pinSignInRetryAfterSeconds", () => {
  const failedAt = new Date("2026-01-01T10:00:00.000Z");
  const after = (ms: number) => new Date(failedAt.getTime() + ms);

  it("asks for the whole delay right after the failure", () => {
    expect(pinSignInRetryAfterSeconds(5, failedAt, failedAt)).toBe(4);
  });

  it("rounds a partly elapsed second up", () => {
    expect(pinSignInRetryAfterSeconds(5, failedAt, after(1_500))).toBe(3);
    expect(pinSignInRetryAfterSeconds(5, failedAt, after(3_999))).toBe(1);
  });

  it("asks for nothing once the delay has elapsed", () => {
    expect(pinSignInRetryAfterSeconds(5, failedAt, after(4_000))).toBe(0);
    expect(pinSignInRetryAfterSeconds(5, failedAt, after(60_000))).toBe(0);
  });

  it("asks for nothing while failures carry no delay", () => {
    expect(pinSignInRetryAfterSeconds(2, failedAt, failedAt)).toBe(0);
  });

  it("does not stretch the wait when the clock was set back", () => {
    expect(pinSignInRetryAfterSeconds(8, failedAt, after(-3_600_000))).toBe(30);
  });

  it("never asks for more than the delay itself", () => {
    fc.assert(
      fc.property(
        failures,
        instant,
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        (count, last, offsetMs) =>
          pinSignInRetryAfterSeconds(count, last, new Date(last.getTime() + offsetMs)) <=
          pinSignInDelaySeconds(count),
      ),
    );
  });

  it("asks for nothing once the delay has elapsed, whatever the failures", () => {
    fc.assert(
      fc.property(failures, instant, fc.nat(1_000_000), (count, last, extraMs) => {
        const now = new Date(last.getTime() + pinSignInDelaySeconds(count) * 1000 + extraMs);
        return pinSignInRetryAfterSeconds(count, last, now) === 0;
      }),
    );
  });

  it("asks for a positive wait while part of the delay is still pending", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 200 }), instant, (count, last) => {
        const now = new Date(last.getTime() + pinSignInDelaySeconds(count) * 1000 - 1);
        return pinSignInRetryAfterSeconds(count, last, now) === 1;
      }),
    );
  });

  it("never lengthens as time passes", () => {
    fc.assert(
      fc.property(
        failures,
        instant,
        fc.nat(100_000),
        fc.nat(100_000),
        (count, last, earlierMs, gapMs) =>
          pinSignInRetryAfterSeconds(count, last, new Date(last.getTime() + earlierMs + gapMs)) <=
          pinSignInRetryAfterSeconds(count, last, new Date(last.getTime() + earlierMs)),
      ),
    );
  });
});
