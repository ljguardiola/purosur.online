import { PAID_ORDER_PAYMENT_STATE } from "./paid-order-discovery.js";
import { isMercadoPagoMethod } from "./payment.js";
import {
  LATE_PAYMENT_REFUND_ORIGIN,
  RETURN_REFUND_ORIGIN,
  SALE_CANCELLED_REFUND_ORIGIN,
  SALE_VOIDED_REFUND_ORIGIN,
} from "./payment-refund.js";

export const MERCADO_PAGO_REFUND_FOLLOW_INTERVAL_MS = 60_000;

export const INSUFFICIENT_BALANCE_REFUSAL = "insufficient_balance";

const PROCESSED_REFUND_STATUS = "processed";

type CorrectionRefundOrigin = typeof SALE_VOIDED_REFUND_ORIGIN | typeof RETURN_REFUND_ORIGIN;

export function isRefundSentByCloud(refund: { method: string; origin: string }): boolean {
  if (
    refund.origin === SALE_VOIDED_REFUND_ORIGIN ||
    refund.origin === SALE_CANCELLED_REFUND_ORIGIN ||
    refund.origin === RETURN_REFUND_ORIGIN
  ) {
    return isMercadoPagoMethod(refund.method);
  }
  return refund.method === "QR" && refund.origin === LATE_PAYMENT_REFUND_ORIGIN;
}

export function isRefundInCloudHands(refund: {
  method: string;
  origin: string;
  confirmedAt: Date | null;
  lastRefusalReason: string | null;
}): boolean {
  return isRefundSentByCloud(refund) && isAwaitingMercadoPago(refund);
}

export interface RecordedRefundOfCorrection {
  origin: CorrectionRefundOrigin;
  paymentTransactionId: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

export function isRefundRefusedForGood(refund: {
  method: string;
  origin: string;
  confirmedAt: Date | null;
  lastRefusalReason: string | null;
}): boolean {
  return (
    isRefundSentByCloud(refund) && mercadoPagoRefundStage({ ...refund, sentAt: null }) === "refused"
  );
}

export function recordedRefundOfCorrection<Refund extends { paymentId: string; method: string }>(
  refund: Refund,
  origin: CorrectionRefundOrigin,
  completion: { actorId: string; at: Date },
): Refund & RecordedRefundOfCorrection {
  const sentByCloud = isRefundSentByCloud({ method: refund.method, origin });
  return {
    ...refund,
    origin,
    paymentTransactionId: sentByCloud ? refund.paymentId : null,
    confirmedBy: sentByCloud ? completion.actorId : null,
    confirmedAt: sentByCloud ? completion.at : null,
  };
}

export function refundIsBackedByItsCorrection(
  refund: { saleId: string; origin: string; originEventId: string | null; orderId: string | null },
  correction: { origin: string; saleId: string } | null,
): boolean {
  return (
    refund.originEventId !== null &&
    refund.orderId !== null &&
    correction !== null &&
    correction.origin === refund.origin &&
    correction.saleId === refund.saleId
  );
}

export interface RefundedPaymentTransaction {
  orderId: string | null;
  amount: number;
  state: string;
}

interface RefundedOfOrder {
  orderId: string | null;
  amount: number;
}

export interface RefundedPaymentFacts {
  origin: string;
  amount: number;
  ownOrderId: string | null;
  salePaymentAmount: number | null;
  refundedOfSalePayment: number;
  paymentTransaction: RefundedPaymentTransaction | null;
  refundedOfPaymentTransactionByOrder: readonly RefundedOfOrder[];
}

type RefundOrderFacts = Pick<RefundedPaymentFacts, "ownOrderId" | "paymentTransaction">;

export function orderToRefund(refund: RefundOrderFacts): string | null {
  return refund.ownOrderId ?? refund.paymentTransaction?.orderId ?? null;
}

export function refundIsBackedByItsLatePayment(refund: RefundOrderFacts): boolean {
  const transaction = refund.paymentTransaction;
  if (transaction === null) {
    return false;
  }
  if (refund.ownOrderId !== null) {
    return true;
  }
  return transaction.state === PAID_ORDER_PAYMENT_STATE && transaction.orderId !== null;
}

export function amountHeldByRefundedPayment(refund: RefundedPaymentFacts): number {
  if (refund.origin !== LATE_PAYMENT_REFUND_ORIGIN) {
    return refund.salePaymentAmount ?? 0;
  }
  if (refund.ownOrderId !== null) {
    return refund.amount;
  }
  return refund.paymentTransaction?.amount ?? 0;
}

export function alreadyRefundedOfPayment(refund: RefundedPaymentFacts): number {
  if (refund.origin !== LATE_PAYMENT_REFUND_ORIGIN) {
    return refund.refundedOfSalePayment;
  }
  return refund.refundedOfPaymentTransactionByOrder
    .filter((refunded) => refunded.orderId === refund.ownOrderId)
    .reduce((sum, refunded) => sum + refunded.amount, 0);
}

export function partialAmountOfOrderRefund(refund: RefundedPaymentFacts): number | null {
  if (refund.origin === RETURN_REFUND_ORIGIN) {
    return refund.amount;
  }
  if (
    refund.origin === LATE_PAYMENT_REFUND_ORIGIN &&
    refund.amount < amountHeldByRefundedPayment(refund)
  ) {
    return refund.amount;
  }
  if (
    refund.origin !== LATE_PAYMENT_REFUND_ORIGIN &&
    refund.paymentTransaction !== null &&
    refund.salePaymentAmount !== null &&
    refund.salePaymentAmount < refund.paymentTransaction.amount
  ) {
    return refund.amount;
  }
  return null;
}

export type MercadoPagoRefundAnswer =
  | { kind: "refunded"; providerRefundId: string; processed: boolean }
  | { kind: "already_refunded" }
  | { kind: "insufficient_balance" }
  | { kind: "refused"; reason: string }
  | { kind: "unavailable" };

export type MercadoPagoRefundProgress =
  | { kind: "done"; providerRefundId: string | null }
  | { kind: "in_process"; providerRefundId: string }
  | { kind: "waiting_for_balance" }
  | { kind: "refused"; reason: string }
  | { kind: "unknown" };

export function progressOfRefundAnswer(answer: MercadoPagoRefundAnswer): MercadoPagoRefundProgress {
  switch (answer.kind) {
    case "refunded":
      return answer.processed
        ? { kind: "done", providerRefundId: answer.providerRefundId }
        : { kind: "in_process", providerRefundId: answer.providerRefundId };
    case "already_refunded":
      return { kind: "done", providerRefundId: null };
    case "insufficient_balance":
      return { kind: "waiting_for_balance" };
    case "refused":
      return { kind: "refused", reason: answer.reason };
    case "unavailable":
      return { kind: "unknown" };
  }
}

export interface MercadoPagoOrderRefund {
  id: string;
  status: string;
}

export function isProcessedByMercadoPago(
  refunds: readonly MercadoPagoOrderRefund[],
  providerRefundId: string,
): boolean {
  return refunds.some(
    (refund) => refund.id === providerRefundId && refund.status === PROCESSED_REFUND_STATUS,
  );
}

export function isAwaitingMercadoPago(refund: {
  confirmedAt: Date | null;
  lastRefusalReason: string | null;
}): boolean {
  return (
    refund.confirmedAt !== null &&
    (refund.lastRefusalReason === null || refund.lastRefusalReason === INSUFFICIENT_BALANCE_REFUSAL)
  );
}

export const MERCADO_PAGO_REFUND_STAGES = [
  "unconfirmed",
  "confirmed",
  "sent",
  "waiting_for_balance",
  "refused",
] as const;
export type MercadoPagoRefundStage = (typeof MERCADO_PAGO_REFUND_STAGES)[number];

export function mercadoPagoRefundStage(refund: {
  confirmedAt: Date | null;
  sentAt: Date | null;
  lastRefusalReason: string | null;
}): MercadoPagoRefundStage {
  if (refund.confirmedAt === null) {
    return "unconfirmed";
  }
  if (refund.lastRefusalReason === INSUFFICIENT_BALANCE_REFUSAL) {
    return "waiting_for_balance";
  }
  if (refund.lastRefusalReason !== null) {
    return "refused";
  }
  return refund.sentAt === null ? "confirmed" : "sent";
}
