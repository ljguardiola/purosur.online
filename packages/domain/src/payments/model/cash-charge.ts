import { isValidCashAmount } from "../../shared/index.js";

export const SMALLEST_CASH_BILL = 10_000;

export type CashCharge =
  | { kind: "invalid_amount" }
  | { kind: "partial"; applied: number; pending: number }
  | { kind: "covered"; applied: number; change: number; cashRounding: number };

function roundedDownToSmallestBill(amountDue: number): number {
  const rounded = amountDue - (amountDue % SMALLEST_CASH_BILL);
  return rounded === 0 ? amountDue : rounded;
}

export function cashCharge(amountDue: number, tendered: number): CashCharge {
  if (tendered <= 0 || !isValidCashAmount(tendered)) {
    return { kind: "invalid_amount" };
  }
  const roundedDue = roundedDownToSmallestBill(amountDue);
  if (tendered < roundedDue) {
    return { kind: "partial", applied: tendered, pending: amountDue - tendered };
  }
  return {
    kind: "covered",
    applied: roundedDue,
    change: tendered - roundedDue,
    cashRounding: amountDue - roundedDue,
  };
}
