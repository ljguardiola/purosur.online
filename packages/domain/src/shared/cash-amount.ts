export const MAX_CASH_AMOUNT_CENTS = 2_147_483_647;

export function isValidCashAmount(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_CASH_AMOUNT_CENTS;
}
