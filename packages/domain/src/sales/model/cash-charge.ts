import { isValidCashAmount } from "../../register/index.js";

export type CashCharge =
  | { kind: "invalid_amount" }
  | { kind: "insufficient"; amountDue: number }
  | { kind: "covered"; applied: number; change: number };

export function cashCharge(amountDue: number, tendered: number): CashCharge {
  if (tendered <= 0 || !isValidCashAmount(tendered)) {
    return { kind: "invalid_amount" };
  }
  if (tendered < amountDue) {
    return { kind: "insufficient", amountDue };
  }
  return { kind: "covered", applied: amountDue, change: tendered - amountDue };
}
