import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shiftCalendarDay } from "../../shared/index.js";
import { daysToExpiry, expiryWindowEnd, isExpired } from "./lot-expiry.js";

const day = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));
const offset = fc.integer({ min: -4000, max: 4000 });

describe("isExpired", () => {
  it("is not expired on its expiry day", () => {
    expect(isExpired("2026-10-13", "2026-10-13")).toBe(false);
  });

  it("is expired the day after its expiry day", () => {
    expect(isExpired("2026-10-12", "2026-10-13")).toBe(true);
  });

  it("is not expired the day before its expiry day", () => {
    expect(isExpired("2026-10-14", "2026-10-13")).toBe(false);
  });

  it("is expired exactly when its expiry day is before today", () => {
    fc.assert(
      fc.property(day, offset, (today, shift) => {
        expect(isExpired(shiftCalendarDay(today, shift), today)).toBe(shift < 0);
      }),
    );
  });
});

describe("daysToExpiry", () => {
  it("counts the calendar days from today to the expiry day", () => {
    expect(daysToExpiry("2026-10-20", "2026-10-13")).toBe(7);
  });

  it("is zero on the expiry day", () => {
    expect(daysToExpiry("2026-10-13", "2026-10-13")).toBe(0);
  });

  it("is negative once expired", () => {
    expect(daysToExpiry("2026-10-10", "2026-10-13")).toBe(-3);
  });

  it("counts across a leap day", () => {
    expect(daysToExpiry("2028-03-01", "2028-02-28")).toBe(2);
  });

  it("is the shift that reaches the expiry day from today", () => {
    fc.assert(
      fc.property(day, offset, (today, shift) => {
        expect(daysToExpiry(shiftCalendarDay(today, shift), today)).toBe(shift);
      }),
    );
  });
});

describe("expiryWindowEnd", () => {
  it("is the day the window of that many days ends", () => {
    expect(expiryWindowEnd("2026-10-13", 30)).toBe("2026-11-12");
  });

  it("is today for a window of zero days", () => {
    expect(expiryWindowEnd("2026-10-13", 0)).toBe("2026-10-13");
  });
});
