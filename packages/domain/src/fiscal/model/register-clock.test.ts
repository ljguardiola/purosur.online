import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isBeforeTaxAuthorityLastIssuedDay,
  isBehindClockMark,
  isInClockCorrectionLapse,
  REGISTER_CLOCK_TOLERANCE_MS,
  raisedClockMark,
} from "./register-clock.js";

const MARK = new Date("2026-10-01T12:00:00.000Z");

describe("REGISTER_CLOCK_TOLERANCE_MS", () => {
  it("is one minute", () => {
    expect(REGISTER_CLOCK_TOLERANCE_MS).toBe(60_000);
  });
});

describe("isBehindClockMark", () => {
  it("never blocks a series the register has no mark for", () => {
    expect(isBehindClockMark(new Date(0), null)).toBe(false);
  });

  it("lets a reading at the mark, ahead of it or exactly one minute behind it through", () => {
    expect(isBehindClockMark(MARK, MARK)).toBe(false);
    expect(isBehindClockMark(new Date(MARK.getTime() + 3_600_000), MARK)).toBe(false);
    expect(isBehindClockMark(new Date(MARK.getTime() - 60_000), MARK)).toBe(false);
  });

  it("blocks a reading more than one minute behind the mark", () => {
    expect(isBehindClockMark(new Date(MARK.getTime() - 60_001), MARK)).toBe(true);
  });

  it("blocks a reading behind the mark by more than the tolerance and no other", () => {
    fc.assert(
      fc.property(fc.integer({ min: -3_600_000, max: 3_600_000 }), (offsetMs) => {
        const reading = new Date(MARK.getTime() + offsetMs);
        expect(isBehindClockMark(reading, MARK)).toBe(offsetMs < -REGISTER_CLOCK_TOLERANCE_MS);
      }),
    );
  });
});

describe("isBeforeTaxAuthorityLastIssuedDay", () => {
  it("never blocks a point of sale whose last authorized document's date is unknown", () => {
    expect(isBeforeTaxAuthorityLastIssuedDay(new Date(0), null)).toBe(false);
  });

  it("blocks a reading on an Argentine calendar day before the one the tax authority last authorized on", () => {
    expect(
      isBeforeTaxAuthorityLastIssuedDay(new Date("2026-10-01T02:59:59.000Z"), "2026-10-01"),
    ).toBe(true);
  });

  it("lets a reading on that day or a later one through", () => {
    expect(
      isBeforeTaxAuthorityLastIssuedDay(new Date("2026-10-01T03:00:00.000Z"), "2026-10-01"),
    ).toBe(false);
    expect(
      isBeforeTaxAuthorityLastIssuedDay(new Date("2026-10-05T12:00:00.000Z"), "2026-10-01"),
    ).toBe(false);
  });
});

describe("isInClockCorrectionLapse", () => {
  const CORRECTION = {
    previousReading: new Date("2026-10-05T15:00:00.000Z"),
    correctedReading: new Date("2026-10-01T15:00:00.000Z"),
  };
  const lapse = (overrides: Partial<Parameters<typeof isInClockCorrectionLapse>[0]> = {}) =>
    isInClockCorrectionLapse({
      reading: new Date("2026-10-02T15:00:00.000Z"),
      taxAuthorityLastIssuedOn: "2026-10-05",
      corrections: [CORRECTION],
      ...overrides,
    });

  it("holds while the reading is before the tax authority's day after a correction that lowered the clock across it", () => {
    expect(lapse()).toBe(true);
  });

  it("does not hold when the tax authority's day is unknown", () => {
    expect(lapse({ taxAuthorityLastIssuedOn: null })).toBe(false);
  });

  it("does not hold when the register was never corrected", () => {
    expect(lapse({ corrections: [] })).toBe(false);
  });

  it("does not hold for an old correction whose previous reading's day is before the tax authority's day", () => {
    expect(
      lapse({
        corrections: [
          {
            previousReading: new Date("2026-10-04T15:00:00.000Z"),
            correctedReading: new Date("2026-10-01T15:00:00.000Z"),
          },
        ],
      }),
    ).toBe(false);
  });

  it("holds when the correction's previous reading is on the tax authority's day", () => {
    expect(
      lapse({
        corrections: [
          {
            previousReading: new Date("2026-10-05T03:00:00.000Z"),
            correctedReading: CORRECTION.correctedReading,
          },
        ],
      }),
    ).toBe(true);
  });

  it("does not hold when the correction's previous reading is the last Argentine moment before that day", () => {
    expect(
      lapse({
        corrections: [
          {
            previousReading: new Date("2026-10-05T02:59:59.000Z"),
            correctedReading: CORRECTION.correctedReading,
          },
        ],
      }),
    ).toBe(false);
  });

  it("does not hold for a correction that did not lower the clock below the tax authority's day", () => {
    expect(
      lapse({
        corrections: [
          {
            previousReading: CORRECTION.previousReading,
            correctedReading: new Date("2026-10-05T03:00:00.000Z"),
          },
        ],
      }),
    ).toBe(false);
  });

  it("holds when the corrected reading is the last Argentine moment before the day", () => {
    expect(
      lapse({
        corrections: [
          {
            previousReading: CORRECTION.previousReading,
            correctedReading: new Date("2026-10-05T02:59:59.000Z"),
          },
        ],
        reading: new Date("2026-10-05T02:59:59.000Z"),
      }),
    ).toBe(true);
  });

  it("holds whichever order the correction that opened it and an earlier unrelated one come in", () => {
    const unrelated = {
      previousReading: new Date("2026-09-20T15:00:00.000Z"),
      correctedReading: new Date("2026-09-18T15:00:00.000Z"),
    };
    expect(lapse({ corrections: [unrelated, CORRECTION] })).toBe(true);
    expect(lapse({ corrections: [CORRECTION, unrelated] })).toBe(true);
  });

  it("does not hold when none of several corrections lowered the clock across the tax authority's day", () => {
    expect(
      lapse({
        corrections: [
          {
            previousReading: new Date("2026-10-04T15:00:00.000Z"),
            correctedReading: new Date("2026-10-01T15:00:00.000Z"),
          },
          {
            previousReading: new Date("2026-10-06T15:00:00.000Z"),
            correctedReading: new Date("2026-10-05T15:00:00.000Z"),
          },
        ],
      }),
    ).toBe(false);
  });

  it("ends when the reading's Argentine day reaches the tax authority's day", () => {
    expect(lapse({ reading: new Date("2026-10-05T02:59:59.000Z") })).toBe(true);
    expect(lapse({ reading: new Date("2026-10-05T03:00:00.000Z") })).toBe(false);
    expect(lapse({ reading: new Date("2026-10-07T12:00:00.000Z") })).toBe(false);
  });
});

describe("raisedClockMark", () => {
  it("takes the reading when the series has no mark yet", () => {
    expect(raisedClockMark(null, MARK)).toEqual(MARK);
  });

  it("takes a reading ahead of the mark", () => {
    const ahead = new Date(MARK.getTime() + 1);
    expect(raisedClockMark(MARK, ahead)).toEqual(ahead);
  });

  it("never lowers the mark", () => {
    expect(raisedClockMark(MARK, new Date(MARK.getTime() - 1))).toEqual(MARK);
  });
});
