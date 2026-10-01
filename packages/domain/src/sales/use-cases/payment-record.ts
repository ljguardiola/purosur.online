import type { JsonValue } from "../../sync/index.js";
import type { PaymentTransaction } from "../model/payment.js";

export function paymentRecord(payment: PaymentTransaction): JsonValue {
  const transfer = payment.method === "TRANSFER" ? payment : undefined;
  return {
    id: payment.id,
    kind: payment.kind,
    method: payment.method,
    provider: payment.provider,
    amount: payment.amount,
    tendered: payment.tendered ?? null,
    state: payment.state,
    occurred_at: payment.occurredAt.toISOString(),
    authorized_by: transfer?.authorizedBy ?? null,
    confirmed_at: transfer?.confirmedAt.toISOString() ?? null,
  };
}
