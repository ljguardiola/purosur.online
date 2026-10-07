import { CalendarDate } from "@internationalized/date";
import { expect, test } from "vitest";
import { calendarDateOf, dayOf, formatReportDay, hasFourDigitYear } from "./report-day";

test("writes a day the Argentine way", () => {
  expect(formatReportDay("2026-10-02")).toBe("02/10/2026");
  expect(formatReportDay("2026-01-31")).toBe("31/01/2026");
});

test("reads a day into the date a date field holds, and back", () => {
  const date = calendarDateOf("2026-10-02");

  expect(date).toEqual(new CalendarDate(2026, 10, 2));
  expect(dayOf(date)).toBe("2026-10-02");
});

test("writes a day with a four-digit year even for an early year", () => {
  expect(dayOf(new CalendarDate(999, 3, 4))).toBe("0999-03-04");
});

test("tells a date typed up to its four-digit year from one still being typed", () => {
  expect(hasFourDigitYear(new CalendarDate(2026, 10, 2))).toBe(true);
  expect(hasFourDigitYear(new CalendarDate(1000, 1, 1))).toBe(true);
  expect(hasFourDigitYear(new CalendarDate(999, 12, 31))).toBe(false);
  expect(hasFourDigitYear(new CalendarDate(2, 10, 2))).toBe(false);
});
