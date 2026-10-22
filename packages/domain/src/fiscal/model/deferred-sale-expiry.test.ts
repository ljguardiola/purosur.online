import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { argentinaCalendarDay, shiftCalendarDay } from "../../shared/index.js";
import { deferredSaleExpiresOn, isDeferredSaleExpired } from "./deferred-sale-expiry.js";

describe("deferredSaleExpiresOn", () => {
  it.each([
    ["2026-10-10T12:00:00-03:00", "2026-10-15"],
    ["2026-10-26T12:00:00-03:00", "2026-10-31"],
    ["2026-10-27T12:00:00-03:00", "2026-10-31"],
    ["2026-10-31T12:00:00-03:00", "2026-10-31"],
    ["2026-04-26T12:00:00-03:00", "2026-04-30"],
    ["2026-04-30T12:00:00-03:00", "2026-04-30"],
    ["2026-02-24T12:00:00-03:00", "2026-02-28"],
    ["2028-02-24T12:00:00-03:00", "2028-02-29"],
    ["2028-02-20T12:00:00-03:00", "2028-02-25"],
    ["2026-12-30T12:00:00-03:00", "2026-12-31"],
    ["2026-01-01T12:00:00-03:00", "2026-01-06"],
  ])("a sale at %s expires on %s", (occurredAt, expected) => {
    expect(deferredSaleExpiresOn(new Date(occurredAt))).toBe(expected);
  });

  it("counts the sale's Argentine day, not its UTC day", () => {
    expect(deferredSaleExpiresOn(new Date("2026-10-10T02:30:00Z"))).toBe("2026-10-14");
    expect(deferredSaleExpiresOn(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-15");
    expect(deferredSaleExpiresOn(new Date("2026-10-31T01:00:00Z"))).toBe("2026-10-30");
  });

  it("is never later than five days after the sale day nor than its month end", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2040-01-01"), noInvalidDate: true }),
        (occurredAt) => {
          const saleDay = argentinaCalendarDay(occurredAt);
          const expiresOn = deferredSaleExpiresOn(occurredAt);
          expect(expiresOn >= saleDay).toBe(true);
          expect(expiresOn <= shiftCalendarDay(saleDay, 5)).toBe(true);
          expect(expiresOn.slice(0, 7)).toBe(saleDay.slice(0, 7));
        },
      ),
    );
  });
});

describe("isDeferredSaleExpired", () => {
  const occurredAt = new Date("2026-10-10T12:00:00-03:00");

  it("is not expired before the expiry day", () => {
    expect(isDeferredSaleExpired(occurredAt, new Date("2026-10-12T12:00:00-03:00"))).toBe(false);
  });

  it("is not expired through the last instant of the expiry day in Argentina", () => {
    expect(isDeferredSaleExpired(occurredAt, new Date("2026-10-15T23:59:59.999-03:00"))).toBe(
      false,
    );
  });

  it("is expired from the first instant of the day after the expiry day in Argentina", () => {
    expect(isDeferredSaleExpired(occurredAt, new Date("2026-10-16T00:00:00-03:00"))).toBe(true);
  });

  it("expires at month end for a sale on the last day of its month", () => {
    const lastDay = new Date("2026-10-31T20:00:00-03:00");
    expect(isDeferredSaleExpired(lastDay, new Date("2026-10-31T23:59:59-03:00"))).toBe(false);
    expect(isDeferredSaleExpired(lastDay, new Date("2026-11-01T00:00:00-03:00"))).toBe(true);
  });

  it("is not expired before the sale itself", () => {
    expect(isDeferredSaleExpired(occurredAt, new Date("2026-10-01T12:00:00-03:00"))).toBe(false);
  });
});
