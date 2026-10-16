import type { OpenSale } from "@purosur/contracts";
import {
  isRefundSentByCloud,
  type PlannedRefund,
  SALE_CANCELLED_REFUND_ORIGIN,
} from "@purosur/domain";

export function toWireRefund(refund: PlannedRefund): OpenSale["refunds_on_cancel"][number] {
  return {
    payment_id: refund.paymentId,
    method: refund.method,
    amount: refund.amount,
    state: refund.state,
    sent_by_cloud: isRefundSentByCloud({
      method: refund.method,
      origin: SALE_CANCELLED_REFUND_ORIGIN,
    }),
  };
}
