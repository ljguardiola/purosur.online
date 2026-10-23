import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { deferredSaleAgeInDays } from "./deferred-sale-age.js";

function sale(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

describe("deferredSaleAgeInDays", () => {
  it("is zero on the day of the sale", () => {
    expect(deferredSaleAgeInDays(sale("2026-10-10", "00:00"), sale("2026-10-10", "23:59"))).toBe(0);
  });

  it("counts Argentine calendar days, not elapsed hours", () => {
    expect(deferredSaleAgeInDays(sale("2026-10-10", "23:59"), sale("2026-10-11", "00:01"))).toBe(1);
    expect(deferredSaleAgeInDays(sale("2026-10-10", "00:01"), sale("2026-10-12", "23:59"))).toBe(2);
  });

  it("counts across month and year ends", () => {
    expect(deferredSaleAgeInDays(sale("2026-12-30"), sale("2027-01-02"))).toBe(3);
    expect(deferredSaleAgeInDays(sale("2028-02-27"), sale("2028-03-01"))).toBe(3);
  });

  it("uses the Argentine day when the instant is already the next UTC day", () => {
    expect(
      deferredSaleAgeInDays(new Date("2026-10-11T01:30:00Z"), new Date("2026-10-11T02:30:00Z")),
    ).toBe(0);
  });
});
