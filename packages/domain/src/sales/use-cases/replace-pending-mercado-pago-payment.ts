import type { RegisterRestoration } from "./register-restoration.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface ReplacePendingMercadoPagoPaymentInput {
  actorId: string;
  paymentTransactionId: string;
  replacedAt: Date;
}

export interface ReplacePendingMercadoPagoPaymentPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  ids: IdGenerator;
}

export type PendingMercadoPagoPaymentReplacementRefusal =
  | SellingSessionRefusal
  | { kind: "not_pending" }
  | { kind: "no_open_sale" }
  | { kind: "unavailable" };

export type ReplacePendingMercadoPagoPaymentOutcome =
  | { kind: "replaced" }
  | PendingMercadoPagoPaymentReplacementRefusal;

export function replacePendingMercadoPagoPayment(
  { ledger, restoration, ids }: ReplacePendingMercadoPagoPaymentPorts,
  { actorId, paymentTransactionId, replacedAt }: ReplacePendingMercadoPagoPaymentInput,
): ReplacePendingMercadoPagoPaymentOutcome {
  return ledger.transaction<ReplacePendingMercadoPagoPaymentOutcome>((tx) => {
    const session = sellingSession(tx, actorId, restoration);
    if (isRefusal(session)) {
      return session;
    }
    const pending = tx.pendingMercadoPagoPayment(paymentTransactionId);
    if (pending === undefined || pending.method !== "QR") {
      return { kind: "not_pending" };
    }
    if (tx.openSale(session.id)?.id !== pending.saleId) {
      return { kind: "no_open_sale" };
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }

    const waitEndsAt = new Date(Math.min(pending.waitEndsAt.getTime(), replacedAt.getTime()));
    tx.markMercadoPagoPaymentReplaced(paymentTransactionId, waitEndsAt);
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
