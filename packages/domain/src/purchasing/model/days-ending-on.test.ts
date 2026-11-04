import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shiftCalendarDay } from "../../shared/index.js";
import { daysEndingOn } from "./days-ending-on.js";

describe("daysEndingOn", () => {
  it("ends on the given day and starts the given number of days back, inclusive", () => {
    expect(daysEndingOn("2026-10-06", 30)).toEqual({ from: "2026-09-07", to: "2026-10-06" });
  });

  it("is the given day alone for a single day", () => {
    expect(daysEndingOn("2026-10-06", 1)).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it.each([
    ["2026-03-02", 3, "2026-02-28"],
    ["2028-03-02", 3, "2028-02-29"],
    ["2027-01-02", 3, "2026-12-31"],
    ["2026-10-31", 31, "2026-10-01"],
  ])("crosses month, year and leap day boundaries (%s, %i days)", (today, days, from) => {
    expect(daysEndingOn(today, days).from).toBe(from);
  });

  it("spans exactly the given number of calendar days", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2000-01-01T00:00:00Z"),
          max: new Date("2100-01-01T00:00:00Z"),
          noInvalidDate: true,
        }),
        fc.integer({ min: 1, max: 400 }),
        (instant, days) => {
          const today = instant.toISOString().slice(0, 10);
          const { from, to } = daysEndingOn(today, days);

          expect(to).toBe(today);
          expect(shiftCalendarDay(from, days - 1)).toBe(to);
        },
      ),
    );
  });
});
