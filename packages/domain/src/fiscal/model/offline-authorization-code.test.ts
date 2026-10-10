import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  fortnightAfter,
  fortnightContaining,
  fortnightsWithinRequestWindowOn,
  isSameFortnight,
  isSecondHalfOfMonth,
  OFFLINE_AUTHORIZATION_CODE_REQUEST_LEAD_DAYS,
  offlineAuthorizationCodeRequestOpensOn,
} from "./offline-authorization-code.js";

const anyDay = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z") })
  .filter((date) => !Number.isNaN(date.getTime()))
  .map((date) => date.toISOString().slice(0, 10));

describe("fortnightContaining", () => {
  it("is the 1st to the 15th for a day of the first half", () => {
    expect(fortnightContaining("2026-10-01")).toEqual({ start: "2026-10-01", end: "2026-10-15" });
    expect(fortnightContaining("2026-10-15")).toEqual({ start: "2026-10-01", end: "2026-10-15" });
  });

  it("is the 16th to the last day of the month for a day of the second half", () => {
    expect(fortnightContaining("2026-10-16")).toEqual({ start: "2026-10-16", end: "2026-10-31" });
    expect(fortnightContaining("2026-11-30")).toEqual({ start: "2026-11-16", end: "2026-11-30" });
  });

  it("ends the second half of February on its last day, leap year or not", () => {
    expect(fortnightContaining("2027-02-20")).toEqual({ start: "2027-02-16", end: "2027-02-28" });
    expect(fortnightContaining("2028-02-29")).toEqual({ start: "2028-02-16", end: "2028-02-29" });
  });

  it("always contains the day it is asked for", () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const { start, end } = fortnightContaining(day);
        expect(start <= day && day <= end).toBe(true);
      }),
    );
  });
});

describe("fortnightAfter", () => {
  it("follows the first half with the second half of the same month", () => {
    expect(fortnightAfter({ start: "2026-10-01", end: "2026-10-15" })).toEqual({
      start: "2026-10-16",
      end: "2026-10-31",
    });
  });

  it("follows the second half with the first half of the next month, across a year", () => {
    expect(fortnightAfter({ start: "2026-12-16", end: "2026-12-31" })).toEqual({
      start: "2027-01-01",
      end: "2027-01-15",
    });
  });
});

describe("offlineAuthorizationCodeRequestOpensOn", () => {
  it("opens five days before the fortnight starts", () => {
    expect(OFFLINE_AUTHORIZATION_CODE_REQUEST_LEAD_DAYS).toBe(5);
    expect(offlineAuthorizationCodeRequestOpensOn({ start: "2026-10-16", end: "2026-10-31" })).toBe(
      "2026-10-11",
    );
  });

  it("opens in the previous month for a fortnight starting on the 1st", () => {
    expect(offlineAuthorizationCodeRequestOpensOn({ start: "2026-03-01", end: "2026-03-15" })).toBe(
      "2026-02-24",
    );
  });
});

describe("fortnightsWithinRequestWindowOn", () => {
  it("is only the current fortnight before the next one's window opens", () => {
    expect(fortnightsWithinRequestWindowOn("2026-10-10")).toEqual([
      { start: "2026-10-01", end: "2026-10-15" },
    ]);
  });

  it("adds the next fortnight from the day its window opens", () => {
    expect(fortnightsWithinRequestWindowOn("2026-10-11")).toEqual([
      { start: "2026-10-01", end: "2026-10-15" },
      { start: "2026-10-16", end: "2026-10-31" },
    ]);
  });

  it("keeps the next fortnight through the last day of the current one", () => {
    expect(fortnightsWithinRequestWindowOn("2026-10-31")).toEqual([
      { start: "2026-10-16", end: "2026-10-31" },
      { start: "2026-11-01", end: "2026-11-15" },
    ]);
  });

  it("drops a fortnight once it ended", () => {
    expect(fortnightsWithinRequestWindowOn("2026-10-16")).toEqual([
      { start: "2026-10-16", end: "2026-10-31" },
    ]);
  });

  it("holds exactly the fortnights whose window contains the day", () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const current = fortnightContaining(day);
        const next = fortnightAfter(current);
        const expected =
          offlineAuthorizationCodeRequestOpensOn(next) <= day ? [current, next] : [current];
        expect(fortnightsWithinRequestWindowOn(day)).toEqual(expected);
      }),
    );
  });
});

describe("isSameFortnight", () => {
  it("is true for the same first and last day", () => {
    expect(
      isSameFortnight(
        { start: "2026-10-01", end: "2026-10-15" },
        { start: "2026-10-01", end: "2026-10-15" },
      ),
    ).toBe(true);
  });

  it("is false when the first day differs", () => {
    expect(
      isSameFortnight(
        { start: "2026-10-01", end: "2026-10-15" },
        { start: "2026-10-02", end: "2026-10-15" },
      ),
    ).toBe(false);
  });

  it("is false when the last day differs", () => {
    expect(
      isSameFortnight(
        { start: "2026-10-01", end: "2026-10-15" },
        { start: "2026-10-01", end: "2026-10-14" },
      ),
    ).toBe(false);
  });
});

describe("isSecondHalfOfMonth", () => {
  it("is false for the fortnight from the 1st to the 15th", () => {
    expect(isSecondHalfOfMonth({ start: "2026-10-01", end: "2026-10-15" })).toBe(false);
  });

  it("is true for the fortnight from the 16th to the last day of the month", () => {
    expect(isSecondHalfOfMonth({ start: "2026-10-16", end: "2026-10-31" })).toBe(true);
  });
});
