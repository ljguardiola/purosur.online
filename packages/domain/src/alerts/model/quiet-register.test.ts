import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { isRegisterQuiet, QUIET_REGISTER_LAPSE_MS } from "./quiet-register.js";

const MINUTE_MS = 60 * 1000;
const MONDAY = "2026-10-05";
const HOURS = [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" }];

function mondayAt(time: string): Date {
  return new Date(argentinaInstant(MONDAY, time));
}

function minutesBefore(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() - minutes * MINUTE_MS);
}

function quiet(now: Date, overrides: Partial<Parameters<typeof isRegisterQuiet>[0]> = {}): boolean {
  return isRegisterQuiet({
    lastAcceptedPushAt: minutesBefore(now, 60),
    enrolledAt: minutesBefore(now, 600),
    hours: HOURS,
    now,
    ...overrides,
  });
}

describe("QUIET_REGISTER_LAPSE_MS", () => {
  it("is 15 minutes", () => {
    expect(QUIET_REGISTER_LAPSE_MS).toBe(15 * 60 * 1000);
  });
});

describe("isRegisterQuiet", () => {
  const now = mondayAt("12:00");

  it("is true when the last accepted push is older than 15 minutes and the lapse lies in business hours", () => {
    expect(quiet(now)).toBe(true);
  });

  it("is true when the last accepted push is exactly 15 minutes old", () => {
    expect(quiet(now, { lastAcceptedPushAt: minutesBefore(now, 15) })).toBe(true);
  });

  it("is false when the last accepted push is less than 15 minutes old", () => {
    expect(
      quiet(now, { lastAcceptedPushAt: new Date(now.getTime() - QUIET_REGISTER_LAPSE_MS + 1) }),
    ).toBe(false);
  });

  it("counts from the enrollment when no push was ever accepted", () => {
    expect(quiet(now, { lastAcceptedPushAt: null, enrolledAt: minutesBefore(now, 16) })).toBe(true);
    expect(quiet(now, { lastAcceptedPushAt: null, enrolledAt: minutesBefore(now, 14) })).toBe(
      false,
    );
  });

  it("counts from the last accepted push, not from the enrollment, once there is one", () => {
    expect(
      quiet(now, { lastAcceptedPushAt: minutesBefore(now, 5), enrolledAt: minutesBefore(now, 60) }),
    ).toBe(false);
    expect(
      quiet(now, { lastAcceptedPushAt: minutesBefore(now, 60), enrolledAt: minutesBefore(now, 5) }),
    ).toBe(true);
  });

  it("is false while the lapse starts before the branch opens", () => {
    expect(quiet(mondayAt("09:14"))).toBe(false);
  });

  it("is true once the whole lapse lies after the branch opened", () => {
    expect(quiet(mondayAt("09:15"))).toBe(true);
  });

  it("is true when the lapse ends the minute the branch closes", () => {
    expect(quiet(mondayAt("18:00"))).toBe(true);
  });

  it("is false when the lapse straddles the closing", () => {
    expect(quiet(mondayAt("18:01"))).toBe(false);
  });

  it("is false on a day the branch is closed", () => {
    expect(quiet(new Date(argentinaInstant("2026-10-06", "12:00")))).toBe(false);
  });

  it("is false for a branch with no hours", () => {
    expect(quiet(now, { hours: [] })).toBe(false);
  });

  it("is false for every moment of business hours when a push was accepted within the lapse", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 9 * 60 + 15, max: 18 * 60 }),
        fc.integer({ min: 0, max: 14 }),
        (minuteOfDay, minutesAgo) => {
          const at = new Date(
            argentinaInstant(
              MONDAY,
              `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`,
            ),
          );

          return !quiet(at, { lastAcceptedPushAt: minutesBefore(at, minutesAgo) });
        },
      ),
    );
  });
});
