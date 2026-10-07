import { preEmissionGate, preEmissionGateFailedEvent } from "../../fiscal/index.js";
import type { CashMovement } from "../../register/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { PaymentTransaction } from "../model/payment.js";
import type { LinePromotion, SaleWithLines } from "../model/sale.js";
import { paymentRecord } from "./payment-record.js";
import type { IdGenerator, SaleLedgerTransaction } from "./sale-ledger.js";

export type SaleCashMovement = CashMovement & { ref: { type: string; id: string } };

export interface SaleCompletion {
  sale: SaleWithLines;
  total: number;
  payment: PaymentTransaction;
  movements: readonly SaleCashMovement[];
  actorId: string;
  completedAt: Date;
}

export function completeSale(
  tx: SaleLedgerTransaction,
  ids: IdGenerator,
  { sale, total, payment, movements, actorId, completedAt }: SaleCompletion,
): void {
  tx.recordCompletedSale(sale.id, completedAt);
  tx.appendOutboxEvent(
    saleCompletedEvent(ids.next(), sale, total, payment, movements, actorId, completedAt),
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

function frozenPromotion({ id, benefit }: LinePromotion) {
  return benefit.kind === "PERCENT_OFF"
    ? {
        discount_id: id,
        kind: benefit.kind,
        percent: benefit.percent,
        buy_qty: null,
        pay_qty: null,
      }
    : {
        discount_id: id,
        kind: benefit.kind,
        percent: null,
        buy_qty: benefit.buyQty,
        pay_qty: benefit.payQty,
      };
}

function saleCompletedEvent(
  eventId: string,
  sale: SaleWithLines,
  total: number,
  payment: PaymentTransaction,
  movements: readonly SaleCashMovement[],
  actorId: string,
  completedAt: Date,
): OutboxEventDraft {
  const completedAtIso = completedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: "sale_completed",
    schema_version: 2,
    payload: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      occurred_at: completedAtIso,
      total,
      lines: sale.lines.map((line) => ({
        id: line.id,
        product_id: line.productId,
        product_name: line.productName,
        quantity: line.quantity,
        list_unit_price: line.listUnitPrice,
        price_list_id: line.priceListId,
        promotion_id: line.promotionId,
        discount_amount: line.discountAmount,
        promotions: line.promotions.map(frozenPromotion),
        line_total: line.lineTotal,
      })),
      payments: [paymentRecord(payment)],
      cash_movements: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        ref_type: movement.ref.type,
        ref_id: movement.ref.id,
        actor_id: movement.actorId,
        occurred_at: movement.occurredAt.toISOString(),
      })),
    },
    occurred_at: completedAtIso,
    actor_id: actorId,
  };
}
