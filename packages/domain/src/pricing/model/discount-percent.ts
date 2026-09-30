export const DISCOUNT_PERCENT_MIN = 1;
export const DISCOUNT_PERCENT_MAX = 99;

export function isValidDiscountPercent(percent: number): boolean {
  return (
    Number.isInteger(percent) && percent >= DISCOUNT_PERCENT_MIN && percent <= DISCOUNT_PERCENT_MAX
  );
}
