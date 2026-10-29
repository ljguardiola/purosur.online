import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { freightByPeriod } from "./freight-by-period-report.js";
import { aFreight } from "./test-support/registered-freight.js";

describe("freightByPeriod", () => {
  it("reports no months and zero totals for no freight", () => {
    expect(freightByPeriod([])).toEqual({
      months: [],
      totals: { freights: 0, amount: 0 },
    });
  });

  it("reports a month with its freights and the sum of their amounts as recorded", () => {
    const report = freightByPeriod([
      aFreight({ amountCents: 10_000 }),
      aFreight({ amountCents: 2_550 }),
    ]);

    expect(report.months).toEqual([{ month: "2026-10", freights: 2, amount: 12_550 }]);
    expect(report.totals).toEqual({ freights: 2, amount: 12_550 });
  });

  it("splits the freight by the calendar month of the freight day", () => {
    const report = freightByPeriod([
      aFreight({ freightOn: "2026-09-30", amountCents: 100 }),
      aFreight({ freightOn: "2026-10-01", amountCents: 200 }),
      aFreight({ freightOn: "2026-10-31", amountCents: 400 }),
    ]);

    expect(report.months).toEqual([
      { month: "2026-09", freights: 1, amount: 100 },
      { month: "2026-10", freights: 2, amount: 600 },
    ]);
    expect(report.totals).toEqual({ freights: 3, amount: 700 });
  });

  it("orders the months from the earliest", () => {
    const report = freightByPeriod([
      aFreight({ freightOn: "2026-12-02" }),
      aFreight({ freightOn: "2026-10-02" }),
      aFreight({ freightOn: "2027-01-02" }),
      aFreight({ freightOn: "2026-11-02" }),
    ]);

    expect(report.months.map(({ month }) => month)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("does not change the freight it is given", () => {
    const freights = [aFreight({ freightOn: "2026-11-02" }), aFreight({ freightOn: "2026-10-02" })];

    freightByPeriod(freights);

    expect(freights.map(({ freightOn }) => freightOn)).toEqual(["2026-11-02", "2026-10-02"]);
  });

  it("keeps the grand total equal to the sum of the months", () => {
    const freightArbitrary = fc.record({
      freightOn: fc.constantFrom("2026-09-30", "2026-10-01", "2026-11-15"),
      amountCents: fc.integer({ min: 1, max: 10_000_000 }),
    });

    fc.assert(
      fc.property(fc.array(freightArbitrary, { maxLength: 12 }), (freights) => {
        const report = freightByPeriod(freights);

        expect(report.totals.freights).toBe(freights.length);
        expect(report.totals.amount).toBe(
          freights.reduce((sum, { amountCents }) => sum + amountCents, 0),
        );
        expect(report.months.reduce((sum, { freights: count }) => sum + count, 0)).toBe(
          report.totals.freights,
        );
        expect(report.months.reduce((sum, { amount }) => sum + amount, 0)).toBe(
          report.totals.amount,
        );
      }),
    );
  });
});
