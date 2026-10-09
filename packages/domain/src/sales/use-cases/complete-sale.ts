import { preEmissionGate, preEmissionGateFailedEvent } from "../../fiscal/index.js";
import type { PaymentTransaction } from "../../payments/index.js";
import { paymentRecord } from "../../payments/index.js";
import { type OutboxEventDraft, SALE_COMPLETED_EVENT_TYPE } from "../../shared/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { soldLineStockDelta } from "../model/sale-line.js";
import {
  saleCashMovementRecord,
  saleLineRecord,
  saleStockMovementRecord,
} from "./sale-event-records.js";
import type {
  IdGenerator,
  SaleCashMovement,
  SaleLedgerTransaction,
  SaleStockMovement,
} from "./sale-ledger.js";

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
  const operationNumber = tx.takeOperationNumber();
  tx.recordCompletedSale(sale.id, completedAt, operationNumber);
  const eventId = ids.next();
  const stockMovements = sale.lines.map(
    (line): SaleStockMovement => ({
      id: ids.next(),
      saleLineId: line.id,
      productId: line.productId,
      delta: soldLineStockDelta(line),
      occurredAt: completedAt,
    }),
  );
  for (const stockMovement of stockMovements) {
    tx.recordSaleStockMovement(stockMovement);
    tx.addToStockBalance(stockMovement.productId, stockMovement.delta);
  }
  tx.appendOutboxEvent(
    saleCompletedEvent(
      eventId,
      sale,
      operationNumber,
      total,
      payments,
      movements,
      stockMovements,
      actorId,
      completedAt,
    ),
  );
  const gate = preEmissionGate({
    total,
    issuer: tx.issuerIdentificationInEffect(),
    buyerTaxStatuses: tx.buyerTaxStatusSetInEffect(),
  });
  tx.recordPreEmissionGate({ saleId: sale.id, evaluatedAt: completedAt, outcome: gate });
  tx.decideSaleAuthorization({ saleId: sale.id, gate, decidedAt: completedAt, ids });
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
  operationNumber: number,
  total: number,
  payments: readonly PaymentTransaction[],
  movements: readonly SaleCashMovement[],
  stockMovements: readonly SaleStockMovement[],
  actorId: string,
  completedAt: Date,
): OutboxEventDraft {
  const completedAtIso = completedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: SALE_COMPLETED_EVENT_TYPE,
    schema_version: 4,
    payload: {
      id: sale.id,
      operation_number: operationNumber,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      occurred_at: completedAtIso,
      total,
      lines: sale.lines.map(saleLineRecord),
      payments: payments.map(paymentRecord),
      cash_movements: movements.map(saleCashMovementRecord),
      stock_movements: stockMovements.map(saleStockMovementRecord),
    },
    occurred_at: completedAtIso,
    actor_id: actorId,
  };
}
