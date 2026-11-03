export const SMALLEST_CASH_BILL = 10_000;

export function mayBeCashRounding(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && amount < SMALLEST_CASH_BILL;
}
