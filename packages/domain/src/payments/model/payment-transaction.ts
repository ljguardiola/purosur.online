export const PAYMENT_TRANSACTION_STATES = [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type PaymentTransactionState = (typeof PAYMENT_TRANSACTION_STATES)[number];

export const MERCADO_PAGO_ORDER_EXPIRY_MINUTES = 5;

export interface ProviderPaymentTransaction {
  id: string;
  registerId: string;
  saleId: string;
  kind: "SALE";
  method: "QR";
  provider: "MERCADOPAGO_QR";
  amount: number;
  state: PaymentTransactionState;
  needsReview: boolean;
  providerOrderId: string | null;
  creationOutcomeUnknown: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export function mercadoPagoOrderExpiresAt(attemptStartedAt: Date, longestCallMs: number): Date {
  return new Date(
    attemptStartedAt.getTime() + MERCADO_PAGO_ORDER_EXPIRY_MINUTES * 60 * 1000 + longestCallMs,
  );
}

export type ExpiryWithoutOrder = "expired" | "needs_review";

export function expiryWithoutOrder(
  transaction: Pick<
    ProviderPaymentTransaction,
    "state" | "providerOrderId" | "expiresAt" | "creationOutcomeUnknown"
  >,
  now: Date,
): ExpiryWithoutOrder | null {
  if (
    transaction.state !== "PENDING" ||
    transaction.providerOrderId !== null ||
    now.getTime() < transaction.expiresAt.getTime()
  ) {
    return null;
  }
  return transaction.creationOutcomeUnknown ? "needs_review" : "expired";
}

export function isValidOrderAmount(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents > 0;
}
