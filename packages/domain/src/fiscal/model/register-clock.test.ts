import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isBehindClockMark,
  isBeforeTaxAuthorityLastIssuedDay,
  raisedClockMark,
  REGISTER_CLOCK_TOLERANCE_MS,
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
