import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { cashAmountToCharge, cashCharge, SMALLEST_CASH_BILL } from "./cash-charge.js";

describe("SMALLEST_CASH_BILL", () => {
  it("is $100", () => {
    expect(SMALLEST_CASH_BILL).toBe(10_000);
  });
});

function roundedDown(amountDue: number): number {
  return amountDue < SMALLEST_CASH_BILL ? amountDue : amountDue - (amountDue % SMALLEST_CASH_BILL);
}

describe("cashAmountToCharge", () => {
  it("takes the rounding to the smallest bill off the amount due", () => {
    expect(cashAmountToCharge(2_519_250)).toEqual({
      amountToCharge: 2_510_000,
      cashRounding: 9250,
    });
  });

  it("rounds nothing off a multiple of the smallest bill", () => {
    expect(cashAmountToCharge(320_000)).toEqual({ amountToCharge: 320_000, cashRounding: 0 });
  });

  it("rounds nothing off an amount due under the smallest bill", () => {
    expect(cashAmountToCharge(9999)).toEqual({ amountToCharge: 9999, cashRounding: 0 });
  });

  it("is what a cash charge of exactly the amount to charge applies and rounds, for every amount due", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (amountDue) => {
        const { amountToCharge, cashRounding } = cashAmountToCharge(amountDue);
        expect(cashCharge(amountDue, amountToCharge)).toEqual({
          kind: "covered",
          applied: amountToCharge,
          change: 0,
          cashRounding,
        });
        expect(amountToCharge + cashRounding).toBe(amountDue);
      }),
    );
  });
});

describe("cashCharge", () => {
  it("applies the whole amount due and gives no change when the tendered amount is exact", () => {
    expect(cashCharge(2500, 2500)).toEqual({
      kind: "covered",
      applied: 2500,
      change: 0,
      cashRounding: 0,
    });
  });

  it("gives back what the tendered amount exceeds the amount due by", () => {
    expect(cashCharge(2500, 3000)).toEqual({
      kind: "covered",
      applied: 2500,
      change: 500,
      cashRounding: 0,
    });
  });

  it("changes a single cent exactly", () => {
    expect(cashCharge(1, 2)).toEqual({ kind: "covered", applied: 1, change: 1, cashRounding: 0 });
  });

  it("applies a tendered amount below the amount due and leaves the difference pending", () => {
    expect(cashCharge(2500, 2499)).toEqual({ kind: "partial", applied: 2499, pending: 1 });
  });

  it.each([
    0,
    -1,
    -2500,
    0.5,
    2500.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_CASH_AMOUNT_CENTS + 1,
  ])("refuses the tendered amount %s as invalid", (tendered) => {
    expect(cashCharge(2500, tendered)).toEqual({ kind: "invalid_amount" });
  });

  it("accepts the largest amount a cash movement holds", () => {
    expect(cashCharge(1, MAX_CASH_AMOUNT_CENTS)).toEqual({
      kind: "covered",
      applied: 1,
      change: MAX_CASH_AMOUNT_CENTS - 1,
      cashRounding: 0,
    });
  });

  it("applies the exact amount due and gives the rest as change for every covering amount under the smallest bill", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: SMALLEST_CASH_BILL - 1 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (amountDue, extra) => {
          const tendered = amountDue + extra;
          const charge = cashCharge(amountDue, tendered);
          expect(charge).toEqual({
            kind: "covered",
            applied: amountDue,
            change: extra,
            cashRounding: 0,
          });
          expect(charge.kind === "covered" && charge.applied + charge.change).toBe(tendered);
        },
      ),
    );
  });

  it("applies the tendered amount and leaves the rest pending for every valid amount below the rounded amount due", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 1_000_000 })
          .chain((amountDue) =>
            fc.tuple(
              fc.constant(amountDue),
              fc.integer({ min: 1, max: Math.max(1, roundedDown(amountDue) - 1) }),
            ),
          ),
        ([amountDue, tendered]) => {
          fc.pre(tendered < roundedDown(amountDue));
          const charge = cashCharge(amountDue, tendered);
          expect(charge).toEqual({
            kind: "partial",
            applied: tendered,
            pending: amountDue - tendered,
          });
          expect(charge.kind === "partial" && charge.applied + charge.pending).toBe(amountDue);
        },
      ),
    );
  });

  it("rounds the amount due down to the smallest bill and gives change from the rounded amount", () => {
    expect(cashCharge(327_000, 500_000)).toEqual({
      kind: "covered",
      applied: 320_000,
      change: 180_000,
      cashRounding: 7000,
    });
  });

  it("records no rounding when the amount due is already a multiple of the smallest bill", () => {
    expect(cashCharge(320_000, 320_000)).toEqual({
      kind: "covered",
      applied: 320_000,
      change: 0,
      cashRounding: 0,
    });
  });

  it("charges an amount below the smallest bill exactly", () => {
    expect(cashCharge(8000, 10_000)).toEqual({
      kind: "covered",
      applied: 8000,
      change: 2000,
      cashRounding: 0,
    });
  });

  it("rounds the rest of a sale partly paid by another method", () => {
    expect(cashCharge(227_000, 300_000)).toEqual({
      kind: "covered",
      applied: 220_000,
      change: 80_000,
      cashRounding: 7000,
    });
  });

  it("covers a rounded amount due with exactly the rounded amount", () => {
    expect(cashCharge(327_000, 320_000)).toEqual({
      kind: "covered",
      applied: 320_000,
      change: 0,
      cashRounding: 7000,
    });
  });

  it("leaves part pending from the exact amount due when the tendered amount does not cover the rounded one", () => {
    expect(cashCharge(527_000, 200_000)).toEqual({
      kind: "partial",
      applied: 200_000,
      pending: 327_000,
    });
  });

  it("does not round a tendered amount one cent below the rounded amount due", () => {
    expect(cashCharge(327_000, 319_999)).toEqual({
      kind: "partial",
      applied: 319_999,
      pending: 7001,
    });
  });

  it("rounds down by less than the smallest bill and never to zero for every covering amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (amountDue, extra) => {
          const charge = cashCharge(amountDue, amountDue + extra);
          if (charge.kind !== "covered") {
            throw new Error("expected a covered charge");
          }
          expect(charge.cashRounding).toBeGreaterThanOrEqual(0);
          expect(charge.cashRounding).toBeLessThan(SMALLEST_CASH_BILL);
          expect(charge.applied + charge.cashRounding).toBe(amountDue);
          expect(charge.applied).toBeGreaterThan(0);
          expect(charge.applied + charge.change).toBe(amountDue + extra);
        },
      ),
    );
  });

  it("applies a multiple of the smallest bill whenever the amount due reaches it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: SMALLEST_CASH_BILL, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (amountDue, extra) => {
          const charge = cashCharge(amountDue, amountDue + extra);
          expect(charge.kind === "covered" && charge.applied % SMALLEST_CASH_BILL).toBe(0);
        },
      ),
    );
  });
});
