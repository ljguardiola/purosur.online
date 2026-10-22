import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { argentinaCalendarDay, argentinaInstant, shiftCalendarDay } from "../../shared/index.js";
import {
  deferredSaleAgeInDays,
  deferredSaleAlertEscalatesAt,
  deferredSaleAlertOpensAt,
  deferredSaleStanding,
} from "./deferred-sale-alert-deadlines.js";
import { deferredSaleExpiresOn } from "./deferred-sale-expiry.js";

function startOf(day: string): Date {
  return new Date(argentinaInstant(day, "00:00"));
}

function sale(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

describe("deferredSaleAlertOpensAt and deferredSaleAlertEscalatesAt", () => {
  it.each([
    ["2026-10-10", "2026-10-13", "2026-10-14"],
    ["2026-10-24", "2026-10-27", "2026-10-28"],
    ["2026-04-24", "2026-04-27", "2026-04-28"],
    ["2028-02-20", "2028-02-23", "2028-02-24"],
  ])(
    "a sale on %s opens on %s and escalates on %s at the start of the day",
    (saleDay, opens, escalates) => {
      expect(deferredSaleAlertOpensAt(sale(saleDay))).toEqual(startOf(opens));
      expect(deferredSaleAlertEscalatesAt(sale(saleDay))).toEqual(startOf(escalates));
    },
  );

  it("brings both forward when the month-end limit comes first", () => {
    const occurredAt = sale("2026-09-28");
    expect(deferredSaleExpiresOn(occurredAt)).toBe("2026-09-30");
    expect(deferredSaleAlertOpensAt(occurredAt)).toEqual(startOf("2026-09-28"));
    expect(deferredSaleAlertEscalatesAt(occurredAt)).toEqual(startOf("2026-09-29"));
  });

  it("brings only the opening forward when the limit is four days after the sale", () => {
    const occurredAt = sale("2026-09-26");
    expect(deferredSaleAlertOpensAt(occurredAt)).toEqual(startOf("2026-09-28"));
    expect(deferredSaleAlertEscalatesAt(occurredAt)).toEqual(startOf("2026-09-29"));
  });

  it("never goes earlier than the sale itself, for a sale on the last day of its month", () => {
    const occurredAt = sale("2026-09-30", "18:30");
    expect(deferredSaleAlertOpensAt(occurredAt)).toEqual(occurredAt);
    expect(deferredSaleAlertEscalatesAt(occurredAt)).toEqual(occurredAt);
  });

  it("clamps the opening to the sale on the day before the last day of its month", () => {
    const occurredAt = sale("2026-09-29", "18:30");
    expect(deferredSaleAlertOpensAt(occurredAt)).toEqual(occurredAt);
    expect(deferredSaleAlertEscalatesAt(occurredAt)).toEqual(startOf("2026-09-30"));
  });

  it("handles February and its leap day", () => {
    expect(deferredSaleAlertOpensAt(sale("2026-02-26"))).toEqual(startOf("2026-02-26"));
    expect(deferredSaleAlertEscalatesAt(sale("2026-02-26"))).toEqual(startOf("2026-02-27"));
    expect(deferredSaleAlertOpensAt(sale("2028-02-26"))).toEqual(startOf("2028-02-27"));
    expect(deferredSaleAlertEscalatesAt(sale("2028-02-26"))).toEqual(startOf("2028-02-28"));
  });

  it("handles the end of December", () => {
    const occurredAt = sale("2026-12-29", "09:00");
    expect(deferredSaleAlertOpensAt(occurredAt)).toEqual(occurredAt);
    expect(deferredSaleAlertEscalatesAt(occurredAt)).toEqual(startOf("2026-12-30"));
  });

  it("counts the sale's Argentine day when it is already the next UTC day", () => {
    const occurredAt = new Date("2026-10-11T01:30:00Z");
    expect(argentinaCalendarDay(occurredAt)).toBe("2026-10-10");
    expect(deferredSaleAlertOpensAt(occurredAt)).toEqual(startOf("2026-10-13"));
    expect(deferredSaleAlertEscalatesAt(occurredAt)).toEqual(startOf("2026-10-14"));
  });

  it("opens no later than it escalates, which is within the expiry day, and never before the sale", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2040-01-01"), noInvalidDate: true }),
        (occurredAt) => {
          const opensAt = deferredSaleAlertOpensAt(occurredAt);
          const escalatesAt = deferredSaleAlertEscalatesAt(occurredAt);
          const expiryEnd = startOf(shiftCalendarDay(deferredSaleExpiresOn(occurredAt), 1));
          expect(opensAt.getTime()).toBeGreaterThanOrEqual(occurredAt.getTime());
          expect(escalatesAt.getTime()).toBeGreaterThanOrEqual(opensAt.getTime());
          expect(escalatesAt.getTime()).toBeLessThan(expiryEnd.getTime());
        },
      ),
    );
  });
});

describe("deferredSaleStanding", () => {
  const occurredAt = sale("2026-10-10");

  it("is quiet until the opening instant", () => {
    expect(deferredSaleStanding(occurredAt, new Date("2026-10-12T23:59:59.999-03:00"))).toEqual({
      kind: "quiet",
    });
  });

  it("is due from the opening instant", () => {
    expect(deferredSaleStanding(occurredAt, new Date("2026-10-13T00:00:00-03:00"))).toEqual({
      kind: "due",
    });
    expect(deferredSaleStanding(occurredAt, new Date("2026-10-13T23:59:59.999-03:00"))).toEqual({
      kind: "due",
    });
  });

  it("is pressing from the escalation instant through the end of the expiry day", () => {
    expect(deferredSaleStanding(occurredAt, new Date("2026-10-14T00:00:00-03:00"))).toEqual({
      kind: "pressing",
    });
    expect(deferredSaleStanding(occurredAt, new Date("2026-10-15T23:59:59.999-03:00"))).toEqual({
      kind: "pressing",
    });
  });

  it("is expired from the first instant after the expiry day", () => {
    expect(deferredSaleStanding(occurredAt, new Date("2026-10-16T00:00:00-03:00"))).toEqual({
      kind: "expired",
    });
  });

  it("presses from the sale itself when the sale is on the last day of its month", () => {
    const lastDay = sale("2026-09-30", "18:30");
    expect(deferredSaleStanding(lastDay, new Date("2026-09-30T18:29:59.999-03:00"))).toEqual({
      kind: "quiet",
    });
    expect(deferredSaleStanding(lastDay, lastDay)).toEqual({ kind: "pressing" });
    expect(deferredSaleStanding(lastDay, new Date("2026-10-01T00:00:00-03:00"))).toEqual({
      kind: "expired",
    });
  });
});

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
