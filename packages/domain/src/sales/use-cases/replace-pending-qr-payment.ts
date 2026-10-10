import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface ReplacePendingQrPaymentInput {
  actorId: string;
  paymentTransactionId: string;
  replacedAt: Date;
}

export interface ReplacePendingQrPaymentPorts {
  ledger: SaleLedger;
  ids: IdGenerator;
}

export type PendingQrPaymentReplacementRefusal =
  | SellingSessionRefusal
  | { kind: "not_pending" }
  | { kind: "no_open_sale" }
  | { kind: "unavailable" };

export type ReplacePendingQrPaymentOutcome =
  | { kind: "replaced" }
  | PendingQrPaymentReplacementRefusal;

export function replacePendingQrPayment(
  { ledger, ids }: ReplacePendingQrPaymentPorts,
  { actorId, paymentTransactionId, replacedAt }: ReplacePendingQrPaymentInput,
): ReplacePendingQrPaymentOutcome {
  return ledger.transaction<ReplacePendingQrPaymentOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const pending = tx.pendingQrPayment(paymentTransactionId);
    if (pending === undefined) {
      return { kind: "not_pending" };
    }
    if (tx.openSale(session.id)?.id !== pending.saleId) {
      return { kind: "no_open_sale" };
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }

    const waitEndsAt = pending.waitEndsAt < replacedAt ? pending.waitEndsAt : replacedAt;
    tx.markQrPaymentReplaced(paymentTransactionId, waitEndsAt);
    tx.appendOutboxEvent({
      event_id: ids.next(),
      aggregate_type: "Sale",
      aggregate_id: pending.saleId,
      event_type: "qr_payment_replaced",
      schema_version: 1,
      payload: { payment_transaction_id: paymentTransactionId, sale_id: pending.saleId },
      occurred_at: replacedAt.toISOString(),
      actor_id: actorId,
    });
    return { kind: "replaced" };
  });
}
