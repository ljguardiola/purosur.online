import {
  APPROVED_PAYMENT_STATE,
  isRefundPending,
  paymentRecord,
  plannedRefunds,
  type SalePayment,
} from "../../payments/index.js";
import type { Clock, OperationAuthority, OutboxEventDraft } from "../../shared/index.js";
import { saleVoidStockMovements } from "../../stock/index.js";
import type { SaleWithLines } from "../model/sale.js";
import { amountToCharge, settledLines } from "../model/sale-discount.js";
import { isDeferralPending } from "../model/sale-history.js";
import { type SaleVoidRefusal, saleVoidRefusal } from "../model/sale-void.js";
import {
  saleCashMovementRecord,
  saleDiscountRecord,
  saleLineRecord,
  saleStockMovementRecord,
} from "./sale-event-records.js";
import type {
  IdGenerator,
  SaleCashMovement,
  SaleRefund,
  SaleStockMovement,
} from "./sale-ledger.js";
import type { SaleVoidLedger } from "./void-sale-ports.js";

export interface VoidSaleInput {
  saleId: string;
  pendingRefundsConfirmed: boolean;
}

export interface VoidSaleGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface VoidSalePorts<Grant extends VoidSaleGrant, Refusal> {
  ledger: SaleVoidLedger;
  clock: Clock;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

export type VoidSaleOutcome<Grant extends VoidSaleGrant> =
  | { kind: "not_found" }
  | { kind: SaleVoidRefusal }
  | { kind: "pending_refunds_unconfirmed" }
  | { kind: "unavailable" }
  | { kind: "voided"; refunds: SaleRefund[]; grant: Grant };

export async function voidSale<Grant extends VoidSaleGrant, Refusal>(
  { ledger, clock, ids, authority }: VoidSalePorts<Grant, Refusal>,
  { saleId, pendingRefundsConfirmed }: VoidSaleInput,
): Promise<VoidSaleOutcome<Grant> | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;

  return ledger.transaction<VoidSaleOutcome<Grant>>((tx) => {
    const found = tx.saleToVoid(saleId);
    if (found === undefined) {
      return { kind: "not_found" };
    }
    const { sale, inOpenSession, fiscalDocumentStates, deferredRecord, stockMovements } = found;
    const payments = found.payments.filter(
      (payment): payment is SalePayment => payment.state === APPROVED_PAYMENT_STATE,
    );
    const refusal = saleVoidRefusal({
      state: sale.state,
      inOpenSession,
      fiscalDocumentStates,
    });
    if (refusal !== null) {
      return { kind: refusal };
    }
    const planned = plannedRefunds(payments);
    if (!pendingRefundsConfirmed && planned.some(({ state }) => isRefundPending(state))) {
      return { kind: "pending_refunds_unconfirmed" };
    }
    if (!tx.outboxReady()) {
      return { kind: "unavailable" };
    }

    const voidedAt = clock.now();
    tx.recordVoidedSale(sale.id, voidedAt, grant.authorizedBy);
    const refunds: SaleRefund[] = [];
    for (const refund of planned) {
      const recorded = { ...refund, id: ids.next(), saleId: sale.id, occurredAt: voidedAt };
      refunds.push(recorded);
      tx.recordRefund(recorded);
      if (refund.method === "CASH") {
        tx.recordCashMovement(refundMovement(ids, recorded, sale.sessionId, grant));
      }
    }
    const returned = saleVoidStockMovements(stockMovements).map(
      (movement): SaleStockMovement => ({ ...movement, id: ids.next(), occurredAt: voidedAt }),
    );
    for (const movement of returned) {
      tx.recordSaleVoidStockMovement(movement);
      tx.addToStockBalance(movement.productId, movement.delta);
    }
    const deferredRecordCancelled = isDeferralPending(deferredRecord);
    if (deferredRecordCancelled) {
      tx.cancelDeferredSale(sale.id, voidedAt);
    }
    tx.appendOutboxEvent(
      saleVoidedEvent(ids.next(), {
        sale,
        payments,
        refunds,
        movements: tx.saleCashMovements(sale.id),
        stockMovements: returned,
        deferredRecordCancelled,
        grant,
        voidedAt,
      }),
    );
    return { kind: "voided", refunds, grant };
  });
}

function refundMovement(
  ids: IdGenerator,
  refund: SaleRefund,
  sessionId: string,
  { actorId, authorizedBy }: VoidSaleGrant,
): SaleCashMovement {
  return {
    id: ids.next(),
    sessionId,
    type: "REFUND",
    amount: refund.amount,
    actorId,
    occurredAt: refund.occurredAt,
    ref: { type: "sale", id: refund.saleId },
    ...(authorizedBy === undefined ? {} : { authorizedBy }),
  };
}

interface Voiding {
  sale: SaleWithLines;
  payments: readonly SalePayment[];
  refunds: readonly SaleRefund[];
  movements: readonly SaleCashMovement[];
  stockMovements: readonly SaleStockMovement[];
  deferredRecordCancelled: boolean;
  grant: VoidSaleGrant;
  voidedAt: Date;
}

function saleVoidedEvent(
  eventId: string,
  {
    sale,
    payments,
    refunds,
    movements,
    stockMovements,
    deferredRecordCancelled,
    grant,
    voidedAt,
  }: Voiding,
): OutboxEventDraft {
  const voidedAtIso = voidedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: "sale_voided",
    schema_version: 2,
    payload: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      authorized_by: grant.authorizedBy ?? null,
      occurred_at: voidedAtIso,
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
        occurred_at: voidedAtIso,
      })),
      cash_movements: movements.map(saleCashMovementRecord),
      stock_movements: stockMovements.map(saleStockMovementRecord),
      deferred_record_cancelled: deferredRecordCancelled,
    },
    occurred_at: voidedAtIso,
    actor_id: grant.actorId,
  };
}
