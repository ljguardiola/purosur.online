import type { Clock } from "../../shared/index.js";
import type { LatePaymentRefundRequests, LocalPaidOrders } from "./paid-order-ports.js";

export interface ConvertPaidOrderIntoRefundInput {
  paymentTransactionId: string;
}

export interface ConvertPaidOrderIntoRefundPorts {
  refunds: LatePaymentRefundRequests;
  local: LocalPaidOrders;
  clock: Clock;
}

export type ConvertPaidOrderIntoRefundOutcome =
  | { kind: "converted" }
  | { kind: "already_resolved" }
  | { kind: "not_found" }
  | { kind: "refused" }
  | { kind: "unreachable" };

export async function convertPaidOrderIntoRefund(
  { refunds, local, clock }: ConvertPaidOrderIntoRefundPorts,
  { paymentTransactionId }: ConvertPaidOrderIntoRefundInput,
): Promise<ConvertPaidOrderIntoRefundOutcome> {
  const paidOrder = local.paidOrderWithoutSale(paymentTransactionId);
  if (paidOrder === undefined) {
    return { kind: "not_found" };
  }
  if (paidOrder.resolved) {
    return { kind: "already_resolved" };
  }
  const answer = await refunds.openLatePaymentRefund(paymentTransactionId);
  if (answer.kind === "unreachable" || answer.kind === "refused") {
    return answer;
  }
  local.resolvePaidOrderWithoutSale(paymentTransactionId, clock.now());
  return { kind: "converted" };
}
