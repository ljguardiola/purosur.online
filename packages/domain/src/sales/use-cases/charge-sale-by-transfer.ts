import type { PaymentTransaction } from "../model/payment.js";
import { chargeableSale, isChargeRefusal } from "./chargeable-sale.js";
import { completeSale } from "./complete-sale.js";
import type { Clock, IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface ChargeSaleByTransferInput {
  actorId: string;
  saleId: string;
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
  | { kind: "completed"; saleId: string; total: number };

export function chargeSaleByTransfer(
  { ledger, clock, ids }: ChargeSaleByTransferPorts,
  { actorId, saleId }: ChargeSaleByTransferInput,
): ChargeSaleByTransferOutcome {
  return ledger.transaction<ChargeSaleByTransferOutcome>((tx) => {
    const chargeable = chargeableSale(tx, actorId, saleId);
    if (isChargeRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, total } = chargeable;

    const completedAt = clock.now();
    const payment: PaymentTransaction = {
      id: ids.next(),
      saleId: sale.id,
      kind: "SALE",
      method: "TRANSFER",
      provider: "NONE",
      amount: total,
      state: "APPROVED",
      occurredAt: completedAt,
      authorizedBy: actorId,
      confirmedAt: completedAt,
    };

    tx.recordPayment(payment);
    completeSale(tx, ids, { sale, total, payment, movements: [], actorId, completedAt });
    return { kind: "completed", saleId: sale.id, total };
  });
}
