export const PAYMENT_METHODS = ["CASH", "TRANSFER", "QR"] as const;

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
