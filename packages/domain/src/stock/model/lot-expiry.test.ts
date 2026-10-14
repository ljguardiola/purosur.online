import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shiftCalendarDay } from "../../shared/index.js";
import { canExpireWithStock, daysToExpiry, expiryWindowEnd, isExpired } from "./lot-expiry.js";

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

describe("canExpireWithStock", () => {
  const lot = { expiresOn: "2026-10-20" as string | null, technical: false, remaining: 5 };

  it("holds for a lot with an expiry day, not technical, with stock left", () => {
    expect(canExpireWithStock(lot)).toBe(true);
  });

  it("does not hold for a lot without an expiry day", () => {
    expect(canExpireWithStock({ ...lot, expiresOn: null })).toBe(false);
  });

  it("does not hold for a technical lot", () => {
    expect(canExpireWithStock({ ...lot, technical: true })).toBe(false);
  });

  it("does not hold for a lot with nothing left", () => {
    expect(canExpireWithStock({ ...lot, remaining: 0 })).toBe(false);
  });

  it("does not hold for a lot in debt", () => {
    expect(canExpireWithStock({ ...lot, remaining: -1 })).toBe(false);
  });

  it("holds for a lot with the smallest quantity left", () => {
    expect(canExpireWithStock({ ...lot, remaining: 0.001 })).toBe(true);
  });
});
