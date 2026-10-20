import { isRefundRefusedForGood, mercadoPagoRefundStage } from "./mercado-pago-refund.js";
import { isRefundOriginDiscardable } from "./payment-refund.js";

type RefundDiscardRefusal = "not_discardable" | "already_confirmed" | "waiting_for_balance";

interface DiscardableRefundFacts {
  method: string;
  origin: string;
  confirmedAt: Date | null;
  lastRefusalReason: string | null;
}

export function refundDiscardRefusal(refund: DiscardableRefundFacts): RefundDiscardRefusal | null {
  if (isRefundRefusedForGood(refund)) {
    return null;
  }
  if (refund.confirmedAt !== null) {
    return mercadoPagoRefundStage({ ...refund, sentAt: null }) === "waiting_for_balance"
      ? "waiting_for_balance"
      : "already_confirmed";
  }
  return isRefundOriginDiscardable(refund.origin) ? null : "not_discardable";
}

export function isRefundDiscardable(refund: DiscardableRefundFacts): boolean {
  return refundDiscardRefusal(refund) === null;
}
