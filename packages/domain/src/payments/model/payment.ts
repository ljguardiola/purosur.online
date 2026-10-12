export const PAYMENT_METHODS = ["CASH", "TRANSFER", "QR", "POINT"] as const;

export const MERCADO_PAGO_PAYMENT_METHODS = ["QR", "POINT"] as const;

export const MERCADO_PAGO_PROVIDERS = ["MERCADOPAGO_QR", "MERCADOPAGO_POINT"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function hasApprovedPayment(payments: readonly { state: string }[]): boolean {
  return payments.some((payment) => payment.state === "APPROVED");
}

export function holdsApprovedQrPayment(
  payments: readonly { state: string; method: string }[],
): boolean {
  return payments.some((payment) => payment.state === "APPROVED" && payment.method === "QR");
}

export function cancellableWithoutAuthorization(payments: readonly { state: string }[]): boolean {
  return !hasApprovedPayment(payments);
}
