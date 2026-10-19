import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CLOCK_DRIFT_TOLERANCE_MS,
  clockDriftReportOf,
  clockOffsetMs,
  isClockDrifted,
} from "./clock-drift.js";

const ASKED_AT = new Date("2026-10-01T12:00:00.000Z");

function exchange(roundTripMs: number, serverOffsetFromMidpointMs: number) {
  const answeredAt = new Date(ASKED_AT.getTime() + roundTripMs);
  const midpoint = ASKED_AT.getTime() + roundTripMs / 2;
  return {
    askedAt: ASKED_AT,
    answeredAt,
    serverTime: new Date(midpoint + serverOffsetFromMidpointMs),
  };
}

describe("CLOCK_DRIFT_TOLERANCE_MS", () => {
  it("is one minute", () => {
    expect(CLOCK_DRIFT_TOLERANCE_MS).toBe(60_000);
  });
});

describe("clockOffsetMs", () => {
  it("is zero when the server answered at the midpoint of the exchange", () => {
    expect(clockOffsetMs(exchange(400, 0))).toBe(0);
  });

  it("is positive when the register's clock is behind the server's", () => {
    expect(clockOffsetMs(exchange(400, 90_000))).toBe(90_000);
  });

  it("is negative when the register's clock is ahead of the server's", () => {
    expect(clockOffsetMs(exchange(400, -90_000))).toBe(-90_000);
  });

  it("compares the server's time with the midpoint of the round trip, not with either end", () => {
    expect(
      clockOffsetMs({
        askedAt: new Date("2026-10-01T12:00:00.000Z"),
        answeredAt: new Date("2026-10-01T12:00:10.000Z"),
        serverTime: new Date("2026-10-01T12:00:05.000Z"),
      }),
    ).toBe(0);
  });

  it("recovers the offset an exchange was built with", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }).map((half) => half * 2),
        fc.integer({ min: -3_600_000, max: 3_600_000 }),
        (roundTripMs, offsetMs) => {
          expect(clockOffsetMs(exchange(roundTripMs, offsetMs))).toBe(offsetMs);
        },
      ),
    );
  });
});

describe("isClockDrifted", () => {
  it("is not drifted at no offset or exactly one minute either way", () => {
    expect(isClockDrifted(0)).toBe(false);
    expect(isClockDrifted(60_000)).toBe(false);
    expect(isClockDrifted(-60_000)).toBe(false);
  });

  it("is drifted past one minute either way", () => {
    expect(isClockDrifted(60_001)).toBe(true);
    expect(isClockDrifted(-60_001)).toBe(true);
  });

  it("is drifted exactly when the offset's size passes the tolerance", () => {
    fc.assert(
      fc.property(fc.integer({ min: -3_600_000, max: 3_600_000 }), (offsetMs) => {
        expect(isClockDrifted(offsetMs)).toBe(Math.abs(offsetMs) > CLOCK_DRIFT_TOLERANCE_MS);
      }),
    );
  });
});

describe("clockDriftReportOf", () => {
  it("reports nothing when no offset was measured", () => {
    expect(clockDriftReportOf(null)).toEqual({});
  });

  it("reports a drifted clock", () => {
    expect(clockDriftReportOf(61_000)).toEqual({ clock_drift: true });
    expect(clockDriftReportOf(-61_000)).toEqual({ clock_drift: true });
  });

  it("reports a clock back within tolerance", () => {
    expect(clockDriftReportOf(60_000)).toEqual({ clock_drift: false });
    expect(clockDriftReportOf(0)).toEqual({ clock_drift: false });
  });
});
