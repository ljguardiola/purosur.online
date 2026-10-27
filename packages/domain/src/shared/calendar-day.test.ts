import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  isCalendarDay,
  lastDayOfMonth,
  shiftCalendarDay,
} from "./calendar-day.js";

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

describe("shiftCalendarDay", () => {
  it.each([
    ["2026-10-16", -5, "2026-10-11"],
    ["2026-11-01", -5, "2026-10-27"],
    ["2026-03-01", -5, "2026-02-24"],
    ["2028-03-01", -5, "2028-02-25"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-10-16", 0, "2026-10-16"],
    ["2026-10-16", 2, "2026-10-18"],
  ])("moves %s by %i days to %s", (day, days, expected) => {
    expect(shiftCalendarDay(day, days)).toBe(expected);
  });
});

describe("lastDayOfMonth", () => {
  it.each([
    ["2026-01-15", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2028-02-10", "2028-02-29"],
    ["1900-02-10", "1900-02-28"],
    ["2000-02-10", "2000-02-29"],
    ["2026-04-30", "2026-04-30"],
    ["2026-12-01", "2026-12-31"],
    ["2026-10-31", "2026-10-31"],
  ])("is the last day of the month of %s: %s", (day, expected) => {
    expect(lastDayOfMonth(day)).toBe(expected);
  });

  it("stays in the month of the day, never before it, and the next day starts another month", () => {
    fc.assert(
      fc.property(dayBetween("0001-01-01", "9998-12-30"), (day) => {
        const last = lastDayOfMonth(day);
        expect(last.slice(0, 7)).toBe(day.slice(0, 7));
        expect(last >= day).toBe(true);
        expect(shiftCalendarDay(last, 1).slice(0, 7)).not.toBe(day.slice(0, 7));
      }),
    );
  });
});

describe("addCalendarMonths", () => {
  it.each([
    ["2026-03-12", 6, "2026-09-12"],
    ["2026-09-12", 6, "2027-03-12"],
    ["2026-08-31", 6, "2027-02-28"],
    ["2023-08-31", 6, "2024-02-29"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2026-01-30", 2, "2026-03-30"],
    ["2026-05-31", 1, "2026-06-30"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2024-02-29", 48, "2028-02-29"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-10-15", 0, "2026-10-15"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-01-15", -1, "2025-12-15"],
    ["2026-01-15", -13, "2024-12-15"],
    ["2026-07-15", 12, "2027-07-15"],
  ])("moves %s by %i months to %s", (day, months, expected) => {
    expect(addCalendarMonths(day, months)).toBe(expected);
  });

  it("lands on the same day of the month the months away, or on that month's last day when it has no such day", () => {
    fc.assert(
      fc.property(
        dayBetween("1000-01-01", "8000-12-31"),
        fc.integer({ min: -120, max: 120 }),
        (day, months) => {
          const moved = addCalendarMonths(day, months);
          const monthIndex = (value: string) =>
            Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;

          expect(isCalendarDay(moved)).toBe(true);
          expect(monthIndex(moved) - monthIndex(day)).toBe(months);
          expect(Number(moved.slice(8))).toBe(
            Math.min(Number(day.slice(8)), Number(lastDayOfMonth(moved).slice(8))),
          );
        },
      ),
    );
  });
});
