import type { OpenSale } from "@purosur/contracts";
import type { PlannedRefund } from "@purosur/domain";

export function toWireRefund(refund: PlannedRefund): OpenSale["refunds_on_cancel"][number] {
  return {
    payment_id: refund.paymentId,
    method: refund.method,
    amount: refund.amount,
    state: refund.state,
  };
}
