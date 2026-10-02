import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isCalendarDay } from "./calendar-day.js";

const dayNumber = fc.integer({ min: 0, max: 60_000 });

function dayOf(number: number): string {
  return new Date(number * 86_400_000).toISOString().slice(0, 10);
}

function dayBetween(first: string, last: string): fc.Arbitrary<string> {
  return fc
    .date({
      min: new Date(`${first}T00:00:00Z`),
      max: new Date(`${last}T00:00:00Z`),
      noInvalidDate: true,
    })
    .map((date) => date.toISOString().slice(0, 10));
}

describe("isCalendarDay", () => {
  it.each(["2026-09-29", "2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])(
    "accepts %j",
    (day) => {
      expect(isCalendarDay(day)).toBe(true);
    },
  );

  it.each([
    "0000-01-01",
    "0000-02-29",
    "0000-12-31",
    "2026-02-29",
    "1900-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "2026-09-00",
    "2026-9-29",
    "26-09-29",
    "2026/09/29",
    "2026-09-29T00:00:00Z",
    " 2026-09-29",
    "2026-09-29\n",
    "",
    "not a day",
  ])("rejects %j", (day) => {
    expect(isCalendarDay(day)).toBe(false);
  });

  it("accepts every day the calendar has", () => {
    fc.assert(
      fc.property(dayNumber, (number) => {
        expect(isCalendarDay(dayOf(number))).toBe(true);
      }),
    );
  });

  it("accepts every day from year 0001 to year 9999", () => {
    fc.assert(
      fc.property(dayBetween("0001-01-01", "9999-12-31"), (day) => {
        expect(isCalendarDay(day)).toBe(true);
      }),
    );
  });

  it("refuses every day of year 0000, which a database date does not have", () => {
    fc.assert(
      fc.property(dayBetween("0000-01-01", "0000-12-31"), (day) => {
        expect(isCalendarDay(day)).toBe(false);
      }),
    );
  });
});
