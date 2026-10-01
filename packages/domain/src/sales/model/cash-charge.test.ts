import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../register/index.js";
import { cashCharge } from "./cash-charge.js";

describe("cashCharge", () => {
  it("applies the whole amount due and gives no change when the tendered amount is exact", () => {
    expect(cashCharge(2500, 2500)).toEqual({ kind: "covered", applied: 2500, change: 0 });
  });

  it("gives back what the tendered amount exceeds the amount due by", () => {
    expect(cashCharge(2500, 3000)).toEqual({ kind: "covered", applied: 2500, change: 500 });
  });

  it("changes a single cent exactly", () => {
    expect(cashCharge(1, 2)).toEqual({ kind: "covered", applied: 1, change: 1 });
  });

  it("refuses a tendered amount below the amount due and carries the amount due", () => {
    expect(cashCharge(2500, 2499)).toEqual({ kind: "insufficient", amountDue: 2500 });
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
    });
  });

  it("applies the amount due and gives the rest as change for every covering amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (amountDue, extra) => {
          const tendered = amountDue + extra;
          const charge = cashCharge(amountDue, tendered);
          expect(charge).toEqual({ kind: "covered", applied: amountDue, change: extra });
          expect(charge.kind === "covered" && charge.applied + charge.change).toBe(tendered);
        },
      ),
    );
  });

  it("refuses every valid amount below the amount due", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 1_000_000 })
          .chain((amountDue) =>
            fc.tuple(fc.constant(amountDue), fc.integer({ min: 1, max: amountDue - 1 })),
          ),
        ([amountDue, tendered]) => {
          expect(cashCharge(amountDue, tendered)).toEqual({ kind: "insufficient", amountDue });
        },
      ),
    );
  });
});
