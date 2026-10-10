export const PAYMENT_TRANSACTION_STATES = [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type PaymentTransactionState = (typeof PAYMENT_TRANSACTION_STATES)[number];

export const PENDING_PAYMENT_TRANSACTION_STATE: PaymentTransactionState = "PENDING";

export const MERCADO_PAGO_ORDER_EXPIRY_MINUTES = 5;

interface SalePaymentTransaction {
  id: string;
  saleId: string;
  kind: "SALE";
  amount: number;
  occurredAt: Date;
}

interface CashPaymentTransaction extends SalePaymentTransaction {
  method: "CASH";
  provider: "NONE";
  state: "APPROVED";
  tendered?: number;
}

interface TransferPaymentTransaction extends SalePaymentTransaction {
  method: "TRANSFER";
  provider: "NONE";
  state: "APPROVED";
  tendered?: never;
  authorizedBy: string;
  confirmedAt: Date;
}

export interface MercadoPagoQrPaymentTransaction extends SalePaymentTransaction {
  method: "QR";
  provider: "MERCADOPAGO_QR";
  state: PaymentTransactionState;
  tendered?: never;
  authorizedBy?: never;
  confirmedAt?: never;
  waitEndsAt: Date;
  registerId: string;
  needsReview: boolean;
  providerOrderId: string | null;
  creationOutcomeUnknown: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export type PaymentTransaction =
  | CashPaymentTransaction
  | TransferPaymentTransaction
  | MercadoPagoQrPaymentTransaction;

export type SalePayment =
  | CashPaymentTransaction
  | TransferPaymentTransaction
  | (Pick<
      MercadoPagoQrPaymentTransaction,
      | "id"
      | "saleId"
      | "kind"
      | "method"
      | "provider"
      | "amount"
      | "occurredAt"
      | "tendered"
      | "authorizedBy"
      | "confirmedAt"
    > & { state: "APPROVED" });

export type PendingQrSalePayment = Pick<
  MercadoPagoQrPaymentTransaction,
  "id" | "saleId" | "amount" | "occurredAt" | "waitEndsAt"
>;

export type MercadoPagoQrOrderRecord = Omit<
  MercadoPagoQrPaymentTransaction,
  "occurredAt" | "waitEndsAt"
>;

export function mercadoPagoOrderExpiresAt(attemptStartedAt: Date, longestCallMs: number): Date {
  return new Date(
    attemptStartedAt.getTime() + MERCADO_PAGO_ORDER_EXPIRY_MINUTES * 60 * 1000 + longestCallMs,
  );
}

export type ExpiryWithoutOrder = "expired" | "needs_review";

export function expiryWithoutOrder(
  transaction: Pick<
    MercadoPagoQrPaymentTransaction,
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
