import { saleBalance } from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
import {
  chargeableSale,
  isSaleRefusal,
  type PartiallyPaid,
  type SaleRefusal,
} from "./chargeable-sale.js";
import { completeSale } from "./complete-sale.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface SettleApprovedQrPaymentInput {
  actorId: string;
  paymentTransactionId: string;
}

export interface SettleApprovedQrPaymentPorts {
  ledger: SaleLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type SettleApprovedQrPaymentOutcome =
  | { kind: "not_pending" }
  | SaleRefusal
  | PartiallyPaid
  | { kind: "completed"; saleId: string; total: number };

export function settleApprovedQrPayment(
  { ledger, clock, ids }: SettleApprovedQrPaymentPorts,
  { actorId, paymentTransactionId }: SettleApprovedQrPaymentInput,
): SettleApprovedQrPaymentOutcome {
  return ledger.transaction<SettleApprovedQrPaymentOutcome>((tx) => {
    const pendingQr = tx.pendingQrPayment(paymentTransactionId);
    if (pendingQr === undefined) {
      return { kind: "not_pending" };
    }
    const completedAt = clock.now();
    const chargeable = chargeableSale(tx, actorId, pendingQr.saleId, completedAt);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, total } = chargeable;

    tx.approvePendingQrPayment(paymentTransactionId);
    const payments = tx.salePayments(sale.id);
    const { paid, pending } = saleBalance(total, payments);
    if (pending > 0) {
      return { kind: "partially_paid", saleId: sale.id, total, paid, pending };
    }
    completeSale(tx, ids, {
      sale,
      total,
      payments,
      movements: tx.saleCashMovements(sale.id),
      actorId,
      completedAt,
    });
    return { kind: "completed", saleId: sale.id, total };
  });
}
