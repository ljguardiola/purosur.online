import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countResult, expectedBalance } from "./stock-count.js";

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
