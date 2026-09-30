import type { CashMovement } from "../../register/index.js";
import type { OutboxEventDraft } from "../../sync/index.js";
import { cashCharge } from "../model/cash-charge.js";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { saleTotal } from "../model/sale-line.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

type SaleCashMovement = CashMovement & { ref: { type: string; id: string } };

export interface ChargeSaleInCashInput {
  actorId: string;
  saleId: string;
  tendered: number;
}

export interface ChargeSaleInCashPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type ChargeSaleInCashOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "invalid_amount" }
  | { kind: "insufficient_cash"; amountDue: number }
  | { kind: "completed"; saleId: string; total: number; tendered: number; change: number };

export function chargeSaleInCash(
  { ledger, clock, ids }: ChargeSaleInCashPorts,
  { actorId, saleId, tendered }: ChargeSaleInCashInput,
): ChargeSaleInCashOutcome {
  return ledger.transaction<ChargeSaleInCashOutcome>((tx) => {
    const session = sellingSession(tx, actorId);
    if (isRefusal(session)) {
      return session;
    }
    const sale = tx.openSale(session.id);
    if (!sale || sale.id !== saleId) {
      return { kind: "no_open_sale" };
    }
    if (sale.lines.length === 0) {
      return { kind: "empty_sale" };
    }

    const total = saleTotal(sale.lines);
    const charge = cashCharge(total, tendered);
    if (charge.kind === "invalid_amount") {
      return charge;
    }
    if (charge.kind === "insufficient") {
      return { kind: "insufficient_cash", amountDue: charge.amountDue };
    }

    const completedAt = clock.now();
    const payment: PaymentTransaction = {
      id: ids.next(),
      saleId: sale.id,
      kind: "SALE",
      method: "CASH",
      provider: "NONE",
      amount: charge.applied,
      tendered,
      state: "APPROVED",
      occurredAt: completedAt,
    };
    const movements = cashMovements(
      ids,
      sale,
      session.id,
      actorId,
      completedAt,
      tendered,
      charge.change,
    );

    tx.recordPayment(payment);
    for (const movement of movements) {
      tx.recordCashMovement(movement);
    }
    tx.recordCompletedSale(sale.id);
    tx.appendOutboxEvent(
      saleCompletedEvent(ids.next(), sale, payment, movements, actorId, completedAt),
    );
    return { kind: "completed", saleId: sale.id, total, tendered, change: charge.change };
  });
}

function cashMovements(
  ids: IdGenerator,
  sale: SaleWithLines,
  sessionId: string,
  actorId: string,
  occurredAt: Date,
  tendered: number,
  change: number,
): SaleCashMovement[] {
  const movement = (type: "SALE" | "CHANGE", amount: number): SaleCashMovement => ({
    id: ids.next(),
    sessionId,
    type,
    amount,
    actorId,
    occurredAt,
    ref: { type: "sale", id: sale.id },
  });
  return change > 0
    ? [movement("SALE", tendered), movement("CHANGE", change)]
    : [movement("SALE", tendered)];
}

function saleCompletedEvent(
  eventId: string,
  sale: SaleWithLines,
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
    schema_version: 1,
    payload: {
      id: sale.id,
      register_id: sale.registerId,
      device_id: sale.deviceId,
      session_id: sale.sessionId,
      actor_id: sale.actorId,
      occurred_at: sale.occurredAt.toISOString(),
      completed_at: completedAtIso,
      lines: sale.lines.map((line) => ({
        product_id: line.productId,
        product_name: line.productName,
        quantity: line.quantity,
        list_unit_price: line.listUnitPrice,
        price_list_id: line.priceListId,
        line_total: line.lineTotal,
      })),
      payments: [
        {
          id: payment.id,
          kind: payment.kind,
          method: payment.method,
          provider: payment.provider,
          amount: payment.amount,
          tendered: payment.tendered ?? null,
          state: payment.state,
        },
      ],
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
