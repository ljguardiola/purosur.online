import type { SaleUnit } from "../../catalog/index.js";

export const DISCOUNT_BUY_QTY_MIN = 2;
export const DISCOUNT_PAY_QTY_MIN = 1;
// The largest value the storage column's Postgres integer type holds.
export const DISCOUNT_QTY_MAX = 2_147_483_647;

export function isValidDiscountBuyQty(buyQty: number): boolean {
  return Number.isInteger(buyQty) && buyQty >= DISCOUNT_BUY_QTY_MIN && buyQty <= DISCOUNT_QTY_MAX;
}

export function isValidDiscountPayQty(payQty: number): boolean {
  return Number.isInteger(payQty) && payQty >= DISCOUNT_PAY_QTY_MIN && payQty <= DISCOUNT_QTY_MAX;
}

export function isValidDiscountBuyNPayM(buyQty: number, payQty: number): boolean {
  return isValidDiscountBuyQty(buyQty) && isValidDiscountPayQty(payQty) && payQty < buyQty;
}

export function isBuyNPayMSaleUnit(saleUnit: SaleUnit | null): boolean {
  return saleUnit === "UNIT";
}
