import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { amountToChargeInCash } from "./cash-charge.js";
import { quickCashAmounts } from "./quick-cash-amounts.js";

const THOUSAND_PESOS = 100_000;
const QUICK_AMOUNT_STEPS = [THOUSAND_PESOS, 10 * THOUSAND_PESOS, 20 * THOUSAND_PESOS];

describe("quickCashAmounts", () => {
  it("offers the exact amount to charge and the next multiples of $1.000, $10.000 and $20.000", () => {
    expect(quickCashAmounts(2_519_250)).toEqual([2_510_000, 2_600_000, 3_000_000, 4_000_000]);
  });

  it("offers the amount to charge when it is not rounded", () => {
    expect(quickCashAmounts(345_000)).toEqual([345_000, 400_000, 1_000_000, 2_000_000]);
  });

  it("offers a multiple reached by two steps once", () => {
    expect(quickCashAmounts(1_870_000)).toEqual([1_870_000, 1_900_000, 2_000_000]);
  });

  it("offers only the exact amount when every step's multiple equals it", () => {
    expect(quickCashAmounts(2_000_000)).toEqual([2_000_000]);
  });

  it("offers an amount below the smallest bill exactly", () => {
    expect(quickCashAmounts(8000)).toEqual([8000, 100_000, 1_000_000, 2_000_000]);
  });

  it("offers no amount above the largest cash amount", () => {
    expect(quickCashAmounts(MAX_CASH_AMOUNT_CENTS)).toEqual([MAX_CASH_AMOUNT_CENTS - 7647]);
  });

  it("offers at most four ascending amounts without repeats, each covering the amount to charge", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), (amountDue) => {
        const amounts = quickCashAmounts(amountDue);
        const toCharge = amountToChargeInCash(amountDue);
        expect(amounts.length).toBeGreaterThanOrEqual(1);
        expect(amounts.length).toBeLessThanOrEqual(4);
        expect(amounts[0]).toBe(toCharge);
        for (const [index, amount] of amounts.entries()) {
          expect(amount).toBeGreaterThanOrEqual(toCharge);
          if (index > 0) {
            expect(amount).toBeGreaterThan(amounts[index - 1] ?? Number.POSITIVE_INFINITY);
          }
        }
      }),
    );
  });

  it("offers every step's least multiple covering the amount to charge and nothing else", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), (amountDue) => {
        const toCharge = amountToChargeInCash(amountDue);
        const multiples = QUICK_AMOUNT_STEPS.map((step) => Math.ceil(toCharge / step) * step);
        expect(new Set(quickCashAmounts(amountDue))).toEqual(new Set([toCharge, ...multiples]));
      }),
    );
  });
});
