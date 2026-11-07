import { isValidOrderAmount } from "./payment-transaction.js";

export const MERCADO_PAGO_QR_MINIMUM_ORDER_CENTS = 1500;

export function isValidQrOrderAmount(cents: number): boolean {
  return isValidOrderAmount(cents) && cents >= MERCADO_PAGO_QR_MINIMUM_ORDER_CENTS;
}
