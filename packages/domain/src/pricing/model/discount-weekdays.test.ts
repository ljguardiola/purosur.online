import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isoWeekdayOf,
  isValidDiscountWeekdays,
  normalizeDiscountWeekdays,
} from "./discount-weekdays.js";

const dayNumber = fc.integer({ min: 0, max: 60_000 });

function dayOf(number: number): string {
  return new Date(number * 86_400_000).toISOString().slice(0, 10);
}

describe("isoWeekdayOf", () => {
  it.each([
    ["2026-09-28", 1],
    ["2026-09-29", 2],
    ["2026-09-30", 3],
    ["2026-10-01", 4],
    ["2026-10-02", 5],
    ["2026-10-03", 6],
    ["2026-10-04", 7],
    ["2024-02-29", 4],
    ["2000-01-01", 6],
    ["1970-01-01", 4],
  ])("puts %s on ISO weekday %j", (day, weekday) => {
    expect(isoWeekdayOf(day)).toBe(weekday);
  });

  it("advances one weekday per day, wrapping from Sunday to Monday, for any day", () => {
    fc.assert(
      fc.property(dayNumber, (number) => {
        const today = isoWeekdayOf(dayOf(number));
        expect(isoWeekdayOf(dayOf(number + 1))).toBe(today === 7 ? 1 : today + 1);
      }),
    );
  });

  it("stays within 1 to 7 and repeats every seven days, for any day", () => {
    fc.assert(
      fc.property(dayNumber, (number) => {
        const weekday = isoWeekdayOf(dayOf(number));
        expect(weekday).toBeGreaterThanOrEqual(1);
        expect(weekday).toBeLessThanOrEqual(7);
        expect(isoWeekdayOf(dayOf(number + 7))).toBe(weekday);
      }),
    );
  });
});

describe("isValidDiscountWeekdays", () => {
  it.each([[[]], [[1]], [[7, 1, 3]], [[1, 2, 3, 4, 5, 6, 7]]])("accepts %j", (weekdays) => {
    expect(isValidDiscountWeekdays(weekdays)).toBe(true);
  });

  it.each([[[0]], [[8]], [[-1]], [[1.5]], [[Number.NaN]], [[1, 1]], [[3, 5, 3]]])(
    "rejects %j",
    (weekdays) => {
      expect(isValidDiscountWeekdays(weekdays)).toBe(false);
    },
  );

  it("accepts exactly the lists of distinct integers from 1 to 7", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -2, max: 9 }), { maxLength: 10 }), (weekdays) => {
        const expected =
          new Set(weekdays).size === weekdays.length &&
          weekdays.every((weekday) => weekday >= 1 && weekday <= 7);
        expect(isValidDiscountWeekdays(weekdays)).toBe(expected);
      }),
    );
  });
});

describe("normalizeDiscountWeekdays", () => {
  it("sorts the weekdays from Monday to Sunday", () => {
    expect(normalizeDiscountWeekdays([7, 1, 5, 2])).toEqual([1, 2, 5, 7]);
  });

  it("keeps an empty list empty", () => {
    expect(normalizeDiscountWeekdays([])).toEqual([]);
  });

  it("does not modify the list it is given", () => {
    const weekdays = [3, 1];
    normalizeDiscountWeekdays(weekdays);
    expect(weekdays).toEqual([3, 1]);
  });

  it("returns the same weekdays in ascending order, for any valid list", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 7 })), (weekdays) => {
        const normalized = normalizeDiscountWeekdays(weekdays);
        expect(normalized).toEqual([...weekdays].sort((a, b) => a - b));
      }),
    );
  });
});
