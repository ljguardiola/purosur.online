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
  createdAt: Date;
  expiresAt: Date;
}

export function mercadoPagoOrderExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + MERCADO_PAGO_ORDER_EXPIRY_MINUTES * 60 * 1000);
}

export function isValidOrderAmount(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents > 0;
}
