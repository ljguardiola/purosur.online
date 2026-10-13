export const PAYMENT_TRANSACTION_STATES = [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type PaymentTransactionState = (typeof PAYMENT_TRANSACTION_STATES)[number];

export const PENDING_PAYMENT_TRANSACTION_STATE: PaymentTransactionState = "PENDING";

interface SalePaymentTransaction {
  id: string;
  saleId: string;
  kind: "SALE";
  amount: number;
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
}

export interface MercadoPagoPointPaymentTransaction extends SalePaymentTransaction {
  method: "POINT";
  provider: "MERCADOPAGO_POINT";
  state: PaymentTransactionState;
  tendered?: never;
  authorizedBy?: never;
  confirmedAt?: never;
}

export type MercadoPagoPaymentTransaction =
  | MercadoPagoQrPaymentTransaction
  | MercadoPagoPointPaymentTransaction;

export type PaymentTransaction =
  | CashPaymentTransaction
  | TransferPaymentTransaction
  | MercadoPagoPaymentTransaction;

export type SalePayment = PaymentTransaction & { state: "APPROVED"; occurredAt: Date };

export type PendingMercadoPagoSalePayment = MercadoPagoPaymentTransaction & {
  state: "PENDING";
  occurredAt: Date;
  waitEndsAt: Date;
};

interface MercadoPagoOrder {
  registerId: string;
  needsReview: boolean;
  providerOrderId: string | null;
  creationOutcomeUnknown: boolean;
  replaced: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export type MercadoPagoOrderTransaction = MercadoPagoPaymentTransaction & MercadoPagoOrder;

export function mercadoPagoOrderExpiresAt(
  attemptStartedAt: Date,
  lifetimeMinutes: number,
  longestCallMs: number,
): Date {
  return new Date(attemptStartedAt.getTime() + lifetimeMinutes * 60 * 1000 + longestCallMs);
}

export type ExpiryWithoutOrder = "expired" | "needs_review";

export function expiryWithoutOrder(
  transaction: Pick<
    MercadoPagoOrderTransaction,
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

export function mayHaveUnrecordedOrder(
  transaction: Pick<MercadoPagoOrderTransaction, "creationOutcomeUnknown">,
): boolean {
  return transaction.creationOutcomeUnknown;
}

export function awaitsUnrecordedOrder(
  transaction: Pick<
    MercadoPagoOrderTransaction,
    "state" | "providerOrderId" | "creationOutcomeUnknown"
  >,
): boolean {
  return (
    transaction.state === PENDING_PAYMENT_TRANSACTION_STATE &&
    transaction.providerOrderId === null &&
    mayHaveUnrecordedOrder(transaction)
  );
}

export function isValidOrderAmount(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents > 0;
}

export function isLateApproval(
  transaction: Pick<MercadoPagoOrderTransaction, "state" | "replaced">,
): boolean {
  return transaction.state === "APPROVED" && transaction.replaced;
}
