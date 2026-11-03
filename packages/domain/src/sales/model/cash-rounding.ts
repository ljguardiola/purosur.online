import { SMALLEST_CASH_BILL } from "../../payments/index.js";

export function mayBeCashRounding(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && amount < SMALLEST_CASH_BILL;
}
