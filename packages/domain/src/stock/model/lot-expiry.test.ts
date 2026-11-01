import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shiftCalendarDay } from "../../shared/index.js";
import {
  canExpireWithStock,
  countsForShelfLife,
  daysToExpiry,
  expiryReportPeriodOf,
  expiryWindowEnd,
  isExpired,
  lotShelfLifeDays,
} from "./lot-expiry.js";

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

describe("expiryReportPeriodOf", () => {
  it("is the asked period when both bounds are given", () => {
    expect(
      expiryReportPeriodOf({ from: "2026-12-01", to: "2026-12-31" }, "2026-10-13", 30),
    ).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("is the asked period even when it lies in the past", () => {
    expect(
      expiryReportPeriodOf({ from: "2026-01-01", to: "2026-01-31" }, "2026-10-13", 30),
    ).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("runs from today to the end of the warning window when no bound is given", () => {
    expect(expiryReportPeriodOf({}, "2026-10-13", 30)).toEqual({
      from: "2026-10-13",
      to: "2026-11-12",
    });
  });

  it("is the window when only one bound is given", () => {
    const window = { from: "2026-10-13", to: "2026-11-12" };

    expect(expiryReportPeriodOf({ from: "2026-12-01" }, "2026-10-13", 30)).toEqual(window);
    expect(expiryReportPeriodOf({ to: "2026-12-31" }, "2026-10-13", 30)).toEqual(window);
  });

  it("is a single day when the warning window is zero days", () => {
    expect(expiryReportPeriodOf({}, "2026-10-13", 0)).toEqual({
      from: "2026-10-13",
      to: "2026-10-13",
    });
  });
});

describe("lotShelfLifeDays", () => {
  it("counts the calendar days from the day the lot was created to its expiry day", () => {
    expect(lotShelfLifeDays("2026-10-01", "2026-10-11")).toBe(10);
    expect(lotShelfLifeDays("2026-12-25", "2027-01-05")).toBe(11);
  });

  it("is 0 for a lot that expires the day it was created", () => {
    expect(lotShelfLifeDays("2026-10-01", "2026-10-01")).toBe(0);
  });

  it("is never below 0, even for a lot created after its expiry day", () => {
    expect(lotShelfLifeDays("2026-10-05", "2026-10-01")).toBe(0);
  });

  it("matches the days between the two days for any days", () => {
    fc.assert(
      fc.property(day, fc.integer({ min: 0, max: 4000 }), (created, days) => {
        expect(lotShelfLifeDays(created, shiftCalendarDay(created, days))).toBe(days);
        expect(lotShelfLifeDays(shiftCalendarDay(created, days), created)).toBe(0);
      }),
    );
  });
});

describe("countsForShelfLife", () => {
  const purchased = { expiresOn: "2026-10-11", origin: "purchase" as const, batchVoided: false };

  it("counts a lot with an expiry day that came from a purchase", () => {
    expect(countsForShelfLife(purchased)).toBe(true);
  });

  it("counts a lot with an expiry day that came from an assembly batch that was not voided", () => {
    expect(countsForShelfLife({ ...purchased, origin: "assembly_batch" })).toBe(true);
  });

  it("does not count a lot from a voided assembly batch", () => {
    expect(countsForShelfLife({ ...purchased, origin: "assembly_batch", batchVoided: true })).toBe(
      false,
    );
  });

  it("counts a purchased lot whatever its batch flag says", () => {
    expect(countsForShelfLife({ ...purchased, batchVoided: true })).toBe(true);
  });

  it("does not count a lot loaded by the initial count", () => {
    expect(countsForShelfLife({ ...purchased, origin: "initial_count" })).toBe(false);
  });

  it("does not count a technical lot", () => {
    expect(countsForShelfLife({ ...purchased, origin: "technical" })).toBe(false);
  });

  it("does not count a lot without an expiry day", () => {
    expect(countsForShelfLife({ ...purchased, expiresOn: null })).toBe(false);
  });
});
