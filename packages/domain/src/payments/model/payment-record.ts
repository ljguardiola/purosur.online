import type { JsonValue } from "../../shared/index.js";
import { isConfirmedByHand } from "./payment.js";
import type { SalePayment } from "./payment-transaction.js";

export function paymentRecord(payment: SalePayment): JsonValue {
  const confirmed = isConfirmedByHand(payment) ? payment : undefined;
  return {
    id: payment.id,
    kind: payment.kind,
    method: payment.method,
    provider: payment.provider,
    amount: payment.amount,
    tendered: payment.tendered ?? null,
    state: payment.state,
    occurred_at: payment.occurredAt.toISOString(),
    authorized_by: confirmed?.authorizedBy ?? null,
    confirmed_at: confirmed?.confirmedAt.toISOString() ?? null,
  };
}
