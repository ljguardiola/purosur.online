import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isValidDiscountWeekdays, normalizeDiscountWeekdays } from "./discount-weekdays.js";

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
