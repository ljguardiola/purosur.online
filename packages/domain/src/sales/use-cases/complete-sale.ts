import { preEmissionGate, preEmissionGateFailedEvent } from "../../fiscal/index.js";
import type { PaymentTransaction } from "../../payments/index.js";
import { paymentRecord } from "../../payments/index.js";
import { type OutboxEventDraft, SALE_COMPLETED_EVENT_TYPE } from "../../shared/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleCashMovementRecord, saleLineRecord } from "./sale-event-records.js";
import type { IdGenerator, SaleCashMovement, SaleLedgerTransaction } from "./sale-ledger.js";

export interface SaleCompletion {
  sale: SaleWithLines;
  total: number;
  payments: readonly PaymentTransaction[];
  movements: readonly SaleCashMovement[];
  actorId: string;
  completedAt: Date;
}

export function completeSale(
  tx: SaleLedgerTransaction,
  ids: IdGenerator,
  { sale, total, payments, movements, actorId, completedAt }: SaleCompletion,
): void {
  tx.recordCompletedSale(sale.id, completedAt);
  tx.appendOutboxEvent(
    saleCompletedEvent(ids.next(), sale, total, payments, movements, actorId, completedAt),
  );
  const gate = preEmissionGate({
    total,
    issuer: tx.issuerIdentificationInEffect(),
    buyerTaxStatuses: tx.buyerTaxStatusSetInEffect(),
  });
  tx.recordPreEmissionGate({ saleId: sale.id, evaluatedAt: completedAt, outcome: gate });
  if (gate.kind === "failed") {
    tx.appendOutboxEvent(
      preEmissionGateFailedEvent({
        eventId: ids.next(),
        saleId: sale.id,
        registerId: sale.registerId,
        actorId: sale.actorId,
        reason: gate.reason,
        evaluatedAt: completedAt,
      }),
    );
  }
}

function saleCompletedEvent(
  eventId: string,
  sale: SaleWithLines,
  total: number,
  payments: readonly PaymentTransaction[],
  movements: readonly SaleCashMovement[],
  actorId: string,
  completedAt: Date,
): OutboxEventDraft {
  const completedAtIso = completedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: SALE_COMPLETED_EVENT_TYPE,
    schema_version: 2,
    payload: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      occurred_at: completedAtIso,
      total,
      lines: sale.lines.map(saleLineRecord),
      payments: payments.map(paymentRecord),
      cash_movements: movements.map(saleCashMovementRecord),
    },
    occurred_at: completedAtIso,
    actor_id: actorId,
  };
}
