import type { PaymentTransactionState } from "./payment-transaction.js";

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "QR", "POINT"] as const;

export const MERCADO_PAGO_PAYMENT_METHODS = ["QR", "POINT"] as const;

export const MERCADO_PAGO_PROVIDERS = ["MERCADOPAGO_QR", "MERCADOPAGO_POINT"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type MercadoPagoPaymentMethod = (typeof MERCADO_PAGO_PAYMENT_METHODS)[number];

export const APPROVED_PAYMENT_STATE = "APPROVED" satisfies PaymentTransactionState;

export function hasApprovedPayment(payments: readonly { state: string }[]): boolean {
  return payments.some((payment) => payment.state === APPROVED_PAYMENT_STATE);
}

export function holdsApprovedMercadoPagoPayment(
  payments: readonly { state: string; method: string }[],
): boolean {
  return payments.some(
    (payment) =>
      payment.state === APPROVED_PAYMENT_STATE &&
      (payment.method === "QR" || payment.method === "POINT"),
  );
}

export function cancellableWithoutAuthorization(payments: readonly { state: string }[]): boolean {
  return !hasApprovedPayment(payments);
}
