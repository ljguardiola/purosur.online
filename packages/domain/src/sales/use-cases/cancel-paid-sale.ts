import { registerOperationAccess } from "../../register/index.js";
import type { OperationAuthority, OutboxEventDraft } from "../../shared/index.js";
import type { PaymentTransaction } from "../model/payment.js";
import { plannedRefunds } from "../model/payment-refund.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import { paymentRecord } from "./payment-record.js";
import { saleCashMovementRecord, saleLineRecord } from "./sale-event-records.js";
import type {
  Clock,
  IdGenerator,
  SaleCashMovement,
  SaleLedger,
  SaleLedgerTransaction,
  SaleRefund,
} from "./sale-ledger.js";
import { isRefusal, type SellingSessionRefusal, sellingSession } from "./selling-session.js";

export interface CancelPaidSaleInput {
  saleId: string;
  from: "sale" | "locked_register";
}

export interface CancelPaidSaleGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface CancelPaidSalePorts<Grant extends CancelPaidSaleGrant, Refusal> {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
  authority: OperationAuthority<Grant, Refusal>;
}

export type CancelPaidSaleOutcome<Grant extends CancelPaidSaleGrant> =
  | SellingSessionRefusal
  | { kind: "no_open_sale" }
  | { kind: "cancelled"; refunds: SaleRefund[]; grant: Grant };

export async function cancelPaidSale<Grant extends CancelPaidSaleGrant, Refusal>(
  { ledger, clock, ids, authority }: CancelPaidSalePorts<Grant, Refusal>,
  { saleId, from }: CancelPaidSaleInput,
): Promise<CancelPaidSaleOutcome<Grant> | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { grant } = authorization;
  const { actorId, authorizedBy } = grant;

  return ledger.transaction<CancelPaidSaleOutcome<Grant>>((tx) => {
    const session =
      from === "sale" ? sellingSession(tx, actorId) : (tx.openSession() ?? NO_OPEN_SESSION);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (sale?.id !== saleId) {
      return { kind: "no_open_sale" };
    }
    const payments = tx.salePayments(sale.id);
    const planned = plannedRefunds(payments);
    if (planned.length === 0) {
      tx.discardOpenSale(sale.id);
      return { kind: "cancelled", refunds: [], grant };
    }
    if (from === "locked_register" && !mayVoidSale(tx, actorId)) {
      return { kind: "not_permitted" };
    }

    const occurredAt = clock.now();
    tx.recordCancelledSale(sale.id, occurredAt, authorizedBy);
    const refunds: SaleRefund[] = [];
    for (const refund of planned) {
      const recorded = { ...refund, id: ids.next(), saleId: sale.id, occurredAt };
      refunds.push(recorded);
      tx.recordRefund(recorded);
      if (refund.method === "CASH") {
        tx.recordCashMovement(refundMovement(ids, recorded, session.id, grant));
      }
    }
    tx.appendOutboxEvent(
      saleCancelledEvent(ids.next(), {
        sale,
        payments,
        refunds,
        movements: tx.saleCashMovements(sale.id),
        grant,
        occurredAt,
      }),
    );
    return { kind: "cancelled", refunds, grant };
  });
}

const NO_OPEN_SESSION: SellingSessionRefusal = { kind: "no_open_session" };

function mayVoidSale(tx: SaleLedgerTransaction, actorId: string): boolean {
  const actor = { id: actorId, access: tx.sellerAccess(actorId) };
  return registerOperationAccess({ kind: "cancel_paid_sale" }, actor).kind === "permitted";
}

function refundMovement(
  ids: IdGenerator,
  refund: SaleRefund,
  sessionId: string,
  { actorId, authorizedBy }: CancelPaidSaleGrant,
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

interface Cancellation {
  sale: SaleWithLines;
  payments: readonly PaymentTransaction[];
  refunds: readonly SaleRefund[];
  movements: readonly SaleCashMovement[];
  grant: CancelPaidSaleGrant;
  occurredAt: Date;
}

function saleCancelledEvent(
  eventId: string,
  { sale, payments, refunds, movements, grant, occurredAt }: Cancellation,
): OutboxEventDraft {
  const occurredAtIso = occurredAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: "sale_cancelled",
    schema_version: 1,
    payload: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      authorized_by: grant.authorizedBy ?? null,
      occurred_at: occurredAtIso,
      total: saleTotal(sale.lines),
      lines: sale.lines.map(saleLineRecord),
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
    actor_id: grant.actorId,
  };
}
