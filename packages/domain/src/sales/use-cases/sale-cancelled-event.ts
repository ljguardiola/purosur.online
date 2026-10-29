import type { SalePayment } from "../../payments/index.js";
import { paymentRecord } from "../../payments/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { amountToCharge, settledLines } from "../model/sale-discount.js";
import {
  saleCashMovementRecord,
  saleDiscountRecord,
  saleLineRecord,
} from "./sale-event-records.js";
import type { SaleCashMovement, SaleRefund } from "./sale-ledger.js";

export interface SaleCancellation {
  sale: SaleWithLines;
  payments: readonly SalePayment[];
  refunds: readonly SaleRefund[];
  movements: readonly SaleCashMovement[];
  actorId: string;
  authorizedBy: string | undefined;
  occurredAt: Date;
}

export function saleCancelledEvent(
  eventId: string,
  { sale, payments, refunds, movements, actorId, authorizedBy, occurredAt }: SaleCancellation,
): OutboxEventDraft {
  const occurredAtIso = occurredAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: "sale_cancelled",
    schema_version: 9,
    payload: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      authorized_by: authorizedBy ?? null,
      occurred_at: occurredAtIso,
      total: amountToCharge(sale),
      sale_discount: saleDiscountRecord(sale),
      lines: settledLines(sale).map(saleLineRecord),
      payments: payments.map(paymentRecord),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        kind: "REFUND",
        parent_id: refund.paymentId,
        method: refund.method,
        provider: refund.provider,
        amount: refund.amount,
        state: refund.state,
        occurred_at: occurredAtIso,
      })),
      cash_movements: movements.map(saleCashMovementRecord),
    },
    occurred_at: occurredAtIso,
    actor_id: actorId,
  };
}
