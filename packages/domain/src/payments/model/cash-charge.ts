import { isValidCashAmount } from "../../shared/index.js";

export const SMALLEST_CASH_BILL = 10_000;

export type CashCharge =
  | { kind: "invalid_amount" }
  | { kind: "partial"; applied: number; pending: number }
  | { kind: "covered"; applied: number; change: number; cashRounding: number };

export function amountToChargeInCash(amountDue: number): number {
  const rounded = amountDue - (amountDue % SMALLEST_CASH_BILL);
  return rounded === 0 ? amountDue : rounded;
}

export function cashAmountToCharge(amountDue: number): {
  amountToCharge: number;
  cashRounding: number;
} {
  const amountToCharge = amountToChargeInCash(amountDue);
  return { amountToCharge, cashRounding: amountDue - amountToCharge };
}

export function cashCharge(amountDue: number, tendered: number): CashCharge {
  if (tendered <= 0 || !isValidCashAmount(tendered)) {
    return { kind: "invalid_amount" };
  }
  const { amountToCharge, cashRounding } = cashAmountToCharge(amountDue);
  if (tendered < amountToCharge) {
    return { kind: "partial", applied: tendered, pending: amountDue - tendered };
  }
  return {
    kind: "covered",
    applied: amountToCharge,
    change: tendered - amountToCharge,
    cashRounding,
  };
}
