import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nonCashCharge } from "./non-cash-charge.js";

describe("nonCashCharge", () => {
  it("covers the pending balance when the amount equals it", () => {
    expect(nonCashCharge(2500, 2500)).toEqual({ kind: "covered", applied: 2500 });
  });

  it("leaves the difference pending when the amount is below the pending balance", () => {
    expect(nonCashCharge(2500, 1000)).toEqual({ kind: "partial", applied: 1000, pending: 1500 });
  });

  it("accepts a single cent", () => {
    expect(nonCashCharge(2500, 1)).toEqual({ kind: "partial", applied: 1, pending: 2499 });
  });

  it("refuses an amount above the pending balance and carries the pending balance", () => {
    expect(nonCashCharge(2500, 2501)).toEqual({ kind: "exceeds_pending", pending: 2500 });
  });

  it.each([
    0,
    -1,
    -2500,
    0.5,
    1000.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("refuses the amount %s as invalid", (amount) => {
    expect(nonCashCharge(2500, amount)).toEqual({ kind: "invalid_amount" });
  });

  it("refuses an invalid amount before comparing it with the pending balance", () => {
    expect(nonCashCharge(2500, Number.MAX_SAFE_INTEGER + 1)).toEqual({ kind: "invalid_amount" });
  });

  it("accepts the largest safe integer when the pending balance holds it", () => {
    expect(nonCashCharge(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toEqual({
      kind: "covered",
      applied: Number.MAX_SAFE_INTEGER,
    });
  });

  it("applies the amount and leaves the rest pending for every amount below the pending balance", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 1_000_000 })
          .chain((pending) =>
            fc.tuple(fc.constant(pending), fc.integer({ min: 1, max: pending - 1 })),
          ),
        ([pending, amount]) => {
          const charge = nonCashCharge(pending, amount);
          expect(charge).toEqual({ kind: "partial", applied: amount, pending: pending - amount });
          expect(charge.kind === "partial" && charge.applied + charge.pending).toBe(pending);
        },
      ),
    );
  });

  it("refuses every valid amount above the pending balance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (pending, extra) => {
          expect(nonCashCharge(pending, pending + extra)).toEqual({
            kind: "exceeds_pending",
            pending,
          });
        },
      ),
    );
  });
});
