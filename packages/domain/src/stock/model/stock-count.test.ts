import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  countedLotsTotal,
  countResult,
  expectedBalance,
  mayBeCountedTogether,
} from "./stock-count.js";
import { MAX_STOCK_QUANTITY } from "./stock-quantity.js";

describe("countResult", () => {
  it("expects the current balance when nothing was applied after the count", () => {
    expect(countResult({ counted: 16_000, balance: 17_000, appliedAfterCount: 0 })).toEqual({
      expected: 17_000,
      delta: -1000,
    });
  });

  it("expects the balance left after undoing what was applied after the count", () => {
    expect(countResult({ counted: 12_150, balance: 11_400, appliedAfterCount: -1000 })).toEqual({
      expected: 12_400,
      delta: -250,
    });
  });

  it("leaves no difference when the shelf holds what was expected", () => {
    expect(countResult({ counted: 24_000, balance: 26_000, appliedAfterCount: 2000 })).toEqual({
      expected: 24_000,
      delta: 0,
    });
  });

  it("corrects a negative balance up to what was counted", () => {
    expect(countResult({ counted: 0, balance: -4000, appliedAfterCount: 0 })).toEqual({
      expected: -4000,
      delta: 4000,
    });
  });

  it("leaves the balance at what was counted plus what was applied after the count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (counted, balance, appliedAfterCount) => {
          const { delta } = countResult({ counted, balance, appliedAfterCount });
          return balance + delta === counted + appliedAfterCount;
        },
      ),
    );
  });
});

describe("expectedBalance", () => {
  it("is the balance left after undoing what was applied after the moment", () => {
    expect(expectedBalance({ balance: 11_400, appliedAfterCount: -1000 })).toBe(12_400);
  });

  it("is the current balance when nothing was applied after the moment", () => {
    expect(expectedBalance({ balance: -4000, appliedAfterCount: 0 })).toBe(-4000);
  });
});

describe("countedLotsTotal", () => {
  it("is what the lots counted together add up to", () => {
    expect(countedLotsTotal([{ counted: 4250 }, { counted: 0 }, { counted: 1750 }])).toBe(6000);
  });

  it("is the sum of every lot's counted quantity", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1_000_000 })), (quantities) => {
        const lots = quantities.map((counted) => ({ counted }));
        return countedLotsTotal(lots) === quantities.reduce((sum, quantity) => sum + quantity, 0);
      }),
    );
  });
});

describe("mayBeCountedTogether", () => {
  it("accepts lots adding up to the largest quantity a count holds", () => {
    expect(mayBeCountedTogether([{ counted: MAX_STOCK_QUANTITY - 1000 }, { counted: 1000 }])).toBe(
      true,
    );
  });

  it("refuses lots each under the largest quantity whose total is over it", () => {
    expect(mayBeCountedTogether([{ counted: MAX_STOCK_QUANTITY }, { counted: 1 }])).toBe(false);
  });

  it("refuses lots whose total is not a counted quantity", () => {
    expect(mayBeCountedTogether([{ counted: 1000 }, { counted: -2000 }])).toBe(false);
  });
});
