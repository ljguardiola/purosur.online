import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isoWeekdayOf } from "./iso-weekday.js";

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
