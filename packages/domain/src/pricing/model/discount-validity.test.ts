import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isCalendarDay, isDiscountWindowOrdered } from "./discount-validity.js";

const dayNumber = fc.integer({ min: 0, max: 60_000 });

function dayOf(number: number): string {
  return new Date(number * 86_400_000).toISOString().slice(0, 10);
}

describe("isCalendarDay", () => {
  it.each(["2026-09-29", "2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])(
    "accepts %j",
    (day) => {
      expect(isCalendarDay(day)).toBe(true);
    },
  );

  it.each([
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
});

describe("isDiscountWindowOrdered", () => {
  it("accepts a window that ends after it starts", () => {
    expect(isDiscountWindowOrdered("2026-09-12", "2026-09-30")).toBe(true);
  });

  it("accepts a window that starts and ends the same day", () => {
    expect(isDiscountWindowOrdered("2026-09-12", "2026-09-12")).toBe(true);
  });

  it("rejects a window that ends before it starts", () => {
    expect(isDiscountWindowOrdered("2026-09-12", "2026-09-11")).toBe(false);
  });

  it("compares across months and years, not as text digits", () => {
    expect(isDiscountWindowOrdered("2026-12-31", "2027-01-01")).toBe(true);
    expect(isDiscountWindowOrdered("2027-01-01", "2026-12-31")).toBe(false);
  });

  it("is ordered exactly when the end day is not before the start day", () => {
    fc.assert(
      fc.property(dayNumber, dayNumber, (start, end) => {
        expect(isDiscountWindowOrdered(dayOf(start), dayOf(end))).toBe(end >= start);
      }),
    );
  });
});
