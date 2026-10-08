import type { ChargeRefusal } from "../../fiscal/index.js";
import type { PaymentTransaction } from "../../payments/index.js";
import { nonCashCharge } from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
import { chargeableSale, isSaleRefusal, type PartiallyPaid } from "./chargeable-sale.js";
import { completeSale } from "./complete-sale.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface ChargeSaleByTransferInput {
  actorId: string;
  saleId: string;
  amount: number;
}

export interface ChargeSaleByTransferPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type ChargeSaleByTransferOutcome =
  | { kind: "not_permitted" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "zero_total" }
  | ChargeRefusal
  | { kind: "invalid_amount" }
  | { kind: "exceeds_pending"; pending: number }
  | PartiallyPaid
  | { kind: "completed"; saleId: string; total: number };

export function chargeSaleByTransfer(
  { ledger, clock, ids }: ChargeSaleByTransferPorts,
  { actorId, saleId, amount }: ChargeSaleByTransferInput,
): ChargeSaleByTransferOutcome {
  return ledger.transaction<ChargeSaleByTransferOutcome>((tx) => {
    const completedAt = clock.now();
    const chargeable = chargeableSale(tx, actorId, saleId, completedAt);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, total, paid, pending } = chargeable;
    const charge = nonCashCharge(pending, amount);
    if (charge.kind === "invalid_amount" || charge.kind === "exceeds_pending") {
      return charge;
    }

    const payment: PaymentTransaction = {
      id: ids.next(),
      saleId: sale.id,
      kind: "SALE",
      method: "TRANSFER",
      provider: "NONE",
      amount: charge.applied,
      state: "APPROVED",
      occurredAt: completedAt,
      authorizedBy: actorId,
      confirmedAt: completedAt,
    };

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
