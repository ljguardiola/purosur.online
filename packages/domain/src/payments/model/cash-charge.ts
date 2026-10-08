import { isValidCashAmount } from "../../shared/index.js";

export type CashCharge =
  | { kind: "invalid_amount" }
  | { kind: "partial"; applied: number; pending: number }
  | { kind: "covered"; applied: number; change: number };

export function cashCharge(amountDue: number, tendered: number): CashCharge {
  if (tendered <= 0 || !isValidCashAmount(tendered)) {
    return { kind: "invalid_amount" };
  }
  if (tendered < amountDue) {
    return { kind: "partial", applied: tendered, pending: amountDue - tendered };
  }
  return { kind: "covered", applied: amountDue, change: tendered - amountDue };
}
