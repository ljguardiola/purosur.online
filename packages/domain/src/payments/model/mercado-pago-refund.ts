import { PAID_ORDER_PAYMENT_STATE } from "./paid-order-discovery.js";
import { LATE_PAYMENT_REFUND_ORIGIN, SALE_CANCELLED_REFUND_ORIGIN } from "./payment-refund.js";

export const MERCADO_PAGO_REFUND_FOLLOW_INTERVAL_MS = 60_000;

export const INSUFFICIENT_BALANCE_REFUSAL = "insufficient_balance";

const PROCESSED_REFUND_STATUS = "processed";

export function isRefundSentByCloud(refund: { method: string; origin: string }): boolean {
  return (
    refund.method === "QR" &&
    (refund.origin === SALE_CANCELLED_REFUND_ORIGIN || refund.origin === LATE_PAYMENT_REFUND_ORIGIN)
  );
}

export function refundableAmount(paymentAmount: number, refundedOfPayment: number): number {
  return Math.max(0, paymentAmount - refundedOfPayment);
}

export function exceedsRefundable(
  amount: number,
  paymentAmount: number,
  refundedOfPayment: number,
): boolean {
  return amount > refundableAmount(paymentAmount, refundedOfPayment);
}

export function refundIsBackedByItsCancellation(
  refund: { saleId: string; originEventId: string | null; orderId: string | null },
  cancellation: { saleId: string } | null,
): boolean {
  return (
    refund.originEventId !== null &&
    refund.orderId !== null &&
    cancellation !== null &&
    cancellation.saleId === refund.saleId
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
