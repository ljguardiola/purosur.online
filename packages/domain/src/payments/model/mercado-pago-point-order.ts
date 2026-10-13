import { isValidOrderAmount } from "./payment-transaction.js";

export const MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS = 1500;

export const MERCADO_PAGO_POINT_ORDER_EXPIRY_MINUTES = 5;

export function isValidPointOrderAmount(cents: number): boolean {
  return isValidOrderAmount(cents) && cents >= MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS;
}
