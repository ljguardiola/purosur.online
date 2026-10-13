import type { ChargeRefusal } from "../../fiscal/index.js";
import type { ConfirmedByHandMethod, SalePayment } from "../../payments/index.js";
import { nonCashCharge } from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
import { isSaleRefusal, type PartiallyPaid, saleOpenToNewPayment } from "./chargeable-sale.js";
import { completeSale } from "./complete-sale.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface ChargeSaleConfirmedByHandInput {
  actorId: string;
  saleId: string;
  amount: number;
}

export interface ChargeSaleConfirmedByHandPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type ChargeSaleConfirmedByHandOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "zero_total" }
  | ChargeRefusal
  | { kind: "mercado_pago_charge_in_progress" }
  | { kind: "invalid_amount" }
  | { kind: "exceeds_pending"; pending: number }
  | PartiallyPaid
  | { kind: "completed"; saleId: string; total: number };

export function chargeSaleConfirmedByHand(
  { ledger, clock, ids }: ChargeSaleConfirmedByHandPorts,
  { actorId, saleId, amount }: ChargeSaleConfirmedByHandInput,
  method: ConfirmedByHandMethod,
): ChargeSaleConfirmedByHandOutcome {
  return ledger.transaction<ChargeSaleConfirmedByHandOutcome>((tx) => {
    const completedAt = clock.now();
    const chargeable = saleOpenToNewPayment(tx, actorId, saleId, completedAt);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, total, paid, pending } = chargeable;
    const charge = nonCashCharge(pending, amount);
    if (charge.kind === "invalid_amount" || charge.kind === "exceeds_pending") {
      return charge;
    }

    const confirmed = {
      id: ids.next(),
      saleId: sale.id,
      kind: "SALE",
      amount: charge.applied,
      state: "APPROVED",
      occurredAt: completedAt,
      authorizedBy: actorId,
      confirmedAt: completedAt,
    } as const;
    const payment: SalePayment =
      method === "TRANSFER"
        ? { ...confirmed, method, provider: "NONE" }
        : { ...confirmed, method, provider: "EXTERNAL_TERMINAL" };

    tx.recordPayment(payment);
    if (charge.kind === "partial") {
      return {
        kind: "partially_paid",
        saleId: sale.id,
        total,
        paid: paid + charge.applied,
        pending: charge.pending,
      };
    }
    completeSale(tx, ids, {
      sale,
      total,
      payments: tx.salePayments(sale.id),
      movements: tx.saleCashMovements(sale.id),
      actorId,
      completedAt,
    });
    return { kind: "completed", saleId: sale.id, total };
  });
}
