import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDiscountWindowOrdered } from "./discount-validity.js";

const dayNumber = fc.integer({ min: 0, max: 60_000 });

function dayOf(number: number): string {
  return new Date(number * 86_400_000).toISOString().slice(0, 10);
}

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
