import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CashMovementType } from "./cash-session.js";
import { cashBreakdown, expectedCash } from "./expected-cash.js";

const INFLOWS: CashMovementType[] = ["OPENING", "SALE", "CASH_IN"];
const OUTFLOWS: CashMovementType[] = ["CHANGE", "REFUND", "CASH_OUT", "WITHDRAWAL"];

const movement = fc.record({
  type: fc.constantFrom<CashMovementType>(...INFLOWS, ...OUTFLOWS, "CLOSING"),
  amount: fc.integer({ min: 0, max: 1_000_000 }),
});

describe("expectedCash", () => {
  it("is zero for a session without movements", () => {
    expect(expectedCash([])).toBe(0);
  });

  it.each(INFLOWS)("adds a %s amount", (type) => {
    expect(expectedCash([{ type, amount: 500 }])).toBe(500);
  });

  it.each(OUTFLOWS)("subtracts a %s amount", (type) => {
    expect(expectedCash([{ type, amount: 500 }])).toBe(-500);
  });

  it("does not count the closing count", () => {
    expect(expectedCash([{ type: "CLOSING", amount: 90_000 }])).toBe(0);
  });

  it("is what came in minus what went out over a whole shift", () => {
    expect(
      expectedCash([
        { type: "OPENING", amount: 10_000 },
        { type: "SALE", amount: 25_000 },
        { type: "CHANGE", amount: 1_500 },
        { type: "CASH_IN", amount: 2_000 },
        { type: "REFUND", amount: 3_000 },
        { type: "CASH_OUT", amount: 500 },
        { type: "WITHDRAWAL", amount: 8_000 },
        { type: "CLOSING", amount: 24_000 },
      ]),
    ).toBe(24_000);
  });

  it("equals the inflows minus the outflows for any movements", () => {
    fc.assert(
      fc.property(fc.array(movement), (movements) => {
        const total = (types: CashMovementType[]) =>
          movements
            .filter(({ type }) => types.includes(type))
            .reduce((sum, { amount }) => sum + amount, 0);

        expect(expectedCash(movements)).toBe(total(INFLOWS) - total(OUTFLOWS));
      }),
    );
  });

  it("does not depend on the order of the movements", () => {
    fc.assert(
      fc.property(fc.array(movement), (movements) => {
        expect(expectedCash([...movements].reverse())).toBe(expectedCash(movements));
      }),
    );
  });
});

describe("cashBreakdown", () => {
  it("totals every kind of movement on its own line", () => {
    expect(
      cashBreakdown([
        { type: "OPENING", amount: 10_000 },
        { type: "SALE", amount: 20_000 },
        { type: "SALE", amount: 5_000 },
        { type: "CHANGE", amount: 1_500 },
        { type: "CASH_IN", amount: 2_000 },
        { type: "REFUND", amount: 3_000 },
        { type: "CASH_OUT", amount: 500 },
        { type: "WITHDRAWAL", amount: 8_000 },
        { type: "CLOSING", amount: 24_000 },
      ]),
    ).toEqual({
      openingFloat: 10_000,
      cashSales: 25_000,
      changeGiven: 1_500,
      refunds: 3_000,
      cashIn: 2_000,
      expenses: 500,
      withdrawals: 8_000,
      expected: 24_000,
    });
  });

  it("is all zeros without movements", () => {
    expect(cashBreakdown([])).toEqual({
      openingFloat: 0,
      cashSales: 0,
      changeGiven: 0,
      refunds: 0,
      cashIn: 0,
      expenses: 0,
      withdrawals: 0,
      expected: 0,
    });
  });

  it("always ends at the expected cash", () => {
    fc.assert(
      fc.property(fc.array(movement), (movements) => {
        expect(cashBreakdown(movements).expected).toBe(expectedCash(movements));
      }),
    );
  });
});
