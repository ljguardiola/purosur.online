import type { ChargeRefusal } from "../../fiscal/index.js";
import { cashCharge } from "../model/cash-charge.js";
import type { PaymentTransaction } from "../model/payment.js";
import type { SaleWithLines } from "../model/sale.js";
import { chargeableSale, isSaleRefusal } from "./chargeable-sale.js";
import { completeSale, type SaleCashMovement } from "./complete-sale.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";

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
  | { kind: "zero_total" }
  | ChargeRefusal
  | { kind: "invalid_amount" }
  | { kind: "insufficient_cash"; amountDue: number }
  | { kind: "completed"; saleId: string; total: number; tendered: number; change: number };

export function chargeSaleInCash(
  { ledger, clock, ids }: ChargeSaleInCashPorts,
  { actorId, saleId, tendered }: ChargeSaleInCashInput,
): ChargeSaleInCashOutcome {
  return ledger.transaction<ChargeSaleInCashOutcome>((tx) => {
    const completedAt = clock.now();
    const chargeable = chargeableSale(tx, actorId, saleId, completedAt);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { session, sale, total } = chargeable;
    const charge = cashCharge(total, tendered);
    if (charge.kind === "invalid_amount") {
      return charge;
    }
    if (charge.kind === "partial") {
      return { kind: "insufficient_cash", amountDue: total };
    }

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
    completeSale(tx, ids, { sale, total, payment, movements, actorId, completedAt });
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
