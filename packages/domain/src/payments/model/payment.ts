export const PAYMENT_METHODS = ["CASH", "TRANSFER", "QR", "POINT", "STANDALONE_TERMINAL"] as const;

export const MERCADO_PAGO_PAYMENT_METHODS = ["QR", "POINT"] as const;

export const MERCADO_PAGO_PROVIDERS = ["MERCADOPAGO_QR", "MERCADOPAGO_POINT"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type MercadoPagoPaymentMethod = (typeof MERCADO_PAGO_PAYMENT_METHODS)[number];

const CONFIRMED_BY_HAND_METHODS = ["TRANSFER", "STANDALONE_TERMINAL"] as const;

export type ConfirmedByHandMethod = (typeof CONFIRMED_BY_HAND_METHODS)[number];

export function isConfirmedByHand<Payment extends { method: string }>(
  payment: Payment,
): payment is Payment & { method: ConfirmedByHandMethod } {
  return (CONFIRMED_BY_HAND_METHODS as readonly string[]).includes(payment.method);
}

export function hasApprovedPayment(payments: readonly { state: string }[]): boolean {
  return payments.some((payment) => payment.state === "APPROVED");
}

export function holdsApprovedMercadoPagoPayment(
  payments: readonly { state: string; method: string }[],
): boolean {
  return payments.some(
    (payment) =>
      payment.state === "APPROVED" && (payment.method === "QR" || payment.method === "POINT"),
  );
}

export function holdsApprovedStandaloneTerminalPayment(
  payments: readonly { state: string; method: string }[],
): boolean {
  return payments.some(
    (payment) => payment.state === "APPROVED" && payment.method === "STANDALONE_TERMINAL",
  );
}

export function cancellableWithoutAuthorization(payments: readonly { state: string }[]): boolean {
  return !hasApprovedPayment(payments);
}
