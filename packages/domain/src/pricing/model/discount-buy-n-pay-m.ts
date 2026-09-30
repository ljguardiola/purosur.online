export const DISCOUNT_BUY_QTY_MIN = 2;
export const DISCOUNT_PAY_QTY_MIN = 1;

export function isValidDiscountBuyQty(buyQty: number): boolean {
  return Number.isInteger(buyQty) && buyQty >= DISCOUNT_BUY_QTY_MIN;
}

export function isValidDiscountPayQty(payQty: number): boolean {
  return Number.isInteger(payQty) && payQty >= DISCOUNT_PAY_QTY_MIN;
}

export function isValidDiscountBuyNPayM(buyQty: number, payQty: number): boolean {
  return isValidDiscountBuyQty(buyQty) && isValidDiscountPayQty(payQty) && payQty < buyQty;
}
