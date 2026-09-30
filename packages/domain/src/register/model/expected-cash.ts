import type { CashMovement, CashMovementType } from "./cash-session.js";

export interface CashBreakdown {
  openingFloat: number;
  cashSales: number;
  changeGiven: number;
  refunds: number;
  cashIn: number;
  expenses: number;
  withdrawals: number;
  expected: number;
}

type CashBreakdownLine = Exclude<keyof CashBreakdown, "expected">;

interface Treatment {
  direction: 1 | -1;
  line: CashBreakdownLine;
}

const TREATMENT: Record<CashMovementType, Treatment | "not_counted"> = {
  OPENING: { direction: 1, line: "openingFloat" },
  SALE: { direction: 1, line: "cashSales" },
  CASH_IN: { direction: 1, line: "cashIn" },
  CHANGE: { direction: -1, line: "changeGiven" },
  REFUND: { direction: -1, line: "refunds" },
  CASH_OUT: { direction: -1, line: "expenses" },
  WITHDRAWAL: { direction: -1, line: "withdrawals" },
  CLOSING: "not_counted",
};

type CountedMovement = Pick<CashMovement, "type" | "amount">;

export function cashBreakdown(movements: readonly CountedMovement[]): CashBreakdown {
  const breakdown: CashBreakdown = {
    openingFloat: 0,
    cashSales: 0,
    changeGiven: 0,
    refunds: 0,
    cashIn: 0,
    expenses: 0,
    withdrawals: 0,
    expected: 0,
  };
  for (const { type, amount } of movements) {
    const treatment = TREATMENT[type];
    if (treatment !== "not_counted") {
      breakdown[treatment.line] += amount;
      breakdown.expected += treatment.direction * amount;
    }
  }
  return breakdown;
}

export function expectedCash(movements: readonly CountedMovement[]): number {
  return cashBreakdown(movements).expected;
}
