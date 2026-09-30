import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { discountAppliesOn } from "./discount-applies.js";

const everyDay = { active: true, validFrom: "2026-09-12", validTo: "2026-09-30", weekdays: [] };

describe("discountAppliesOn", () => {
  it("applies on every day of its window when no weekday is chosen", () => {
    expect(discountAppliesOn(everyDay, "2026-09-12")).toBe(true);
    expect(discountAppliesOn(everyDay, "2026-09-21")).toBe(true);
    expect(discountAppliesOn(everyDay, "2026-09-30")).toBe(true);
  });

  it("does not apply the day before it starts or the day after it ends", () => {
    expect(discountAppliesOn(everyDay, "2026-09-11")).toBe(false);
    expect(discountAppliesOn(everyDay, "2026-10-01")).toBe(false);
  });

  it("does not apply while switched off, even inside its window", () => {
    expect(discountAppliesOn({ ...everyDay, active: false }, "2026-09-21")).toBe(false);
  });

  it("applies only on the chosen weekdays", () => {
    const weekendOnly = { ...everyDay, weekdays: [6, 7] };

    expect(discountAppliesOn(weekendOnly, "2026-09-19")).toBe(true);
    expect(discountAppliesOn(weekendOnly, "2026-09-20")).toBe(true);
    expect(discountAppliesOn(weekendOnly, "2026-09-21")).toBe(false);
    expect(discountAppliesOn(weekendOnly, "2026-09-18")).toBe(false);
  });

  it("does not apply on a chosen weekday outside its window", () => {
    expect(discountAppliesOn({ ...everyDay, weekdays: [6] }, "2026-10-03")).toBe(false);
  });

  it("applies when active, inside the window and on a chosen weekday, for any combination", () => {
    const day = fc.integer({ min: 0, max: 400 });
    fc.assert(
      fc.property(
        fc.boolean(),
        day,
        day,
        day,
        fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { maxLength: 7 }),
        (active, a, b, today, weekdays) => {
          const [start = 0, end = 0] = [a, b].sort((x, y) => x - y);
          const iso = (number: number) => new Date(number * 86_400_000).toISOString().slice(0, 10);
          const weekday = ((today + 3) % 7) + 1;
          const expected =
            active &&
            today >= start &&
            today <= end &&
            (weekdays.length === 0 || weekdays.includes(weekday));
          expect(
            discountAppliesOn(
              { active, validFrom: iso(start), validTo: iso(end), weekdays },
              iso(today),
            ),
          ).toBe(expected);
        },
      ),
    );
  });
});
