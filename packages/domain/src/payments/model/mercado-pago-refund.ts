import { SALE_CANCELLED_REFUND_ORIGIN } from "./payment-refund.js";

export const MERCADO_PAGO_REFUND_FOLLOW_INTERVAL_MS = 60_000;

export const INSUFFICIENT_BALANCE_REFUSAL = "insufficient_balance";

const PROCESSED_REFUND_STATUS = "processed";

export function isRefundSentByCloud(refund: { method: string; origin: string }): boolean {
  return refund.method === "QR" && refund.origin === SALE_CANCELLED_REFUND_ORIGIN;
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
