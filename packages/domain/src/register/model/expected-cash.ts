import { type CashMovementDirection, cashMovementDirection } from "./cash-movement-direction.js";
import type { CashMovement, CashMovementType } from "./cash-session.js";

export interface CashBreakdownLine {
  amount: number;
  direction: CashMovementDirection;
}

export interface CashBreakdown {
  openingFloat: CashBreakdownLine;
  cashSales: CashBreakdownLine;
  changeGiven: CashBreakdownLine;
  refunds: CashBreakdownLine;
  cashIn: CashBreakdownLine;
  expenses: CashBreakdownLine;
  withdrawals: CashBreakdownLine;
  expected: number;
}

type CashBreakdownLineName = Exclude<keyof CashBreakdown, "expected">;

const LINE: Record<CashMovementType, CashBreakdownLineName | "not_counted"> = {
  OPENING: "openingFloat",
  SALE: "cashSales",
  CASH_IN: "cashIn",
  CHANGE: "changeGiven",
  REFUND: "refunds",
  CASH_OUT: "expenses",
  WITHDRAWAL: "withdrawals",
  CLOSING: "not_counted",
};

type CountedMovement = Pick<CashMovement, "type" | "amount">;

function emptyLine(type: CashMovementType): CashBreakdownLine {
  return { amount: 0, direction: cashMovementDirection(type) };
}

export function cashBreakdown(movements: readonly CountedMovement[]): CashBreakdown {
  const breakdown: CashBreakdown = {
    openingFloat: emptyLine("OPENING"),
    cashSales: emptyLine("SALE"),
    changeGiven: emptyLine("CHANGE"),
    refunds: emptyLine("REFUND"),
    cashIn: emptyLine("CASH_IN"),
    expenses: emptyLine("CASH_OUT"),
    withdrawals: emptyLine("WITHDRAWAL"),
    expected: 0,
  };
  for (const { type, amount } of movements) {
    const line = LINE[type];
    if (line !== "not_counted") {
      breakdown[line].amount += amount;
      breakdown.expected += cashMovementDirection(type) === "in" ? amount : -amount;
    }
  }
  return breakdown;
}

export function expectedCash(movements: readonly CountedMovement[]): number {
  return cashBreakdown(movements).expected;
}
