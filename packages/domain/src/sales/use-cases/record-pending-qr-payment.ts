import { aQrChargeInItsWait, nonCashCharge } from "../../payments/index.js";
import { chargeableSale, isSaleRefusal, type SaleRefusal } from "./chargeable-sale.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface RecordPendingQrPaymentInput {
  actorId: string;
  saleId: string;
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
}

export interface RecordPendingQrPaymentPorts {
  ledger: SaleLedger;
  ids: IdGenerator;
}

export type PendingQrPaymentRefusal =
  | SaleRefusal
  | { kind: "invalid_amount" }
  | { kind: "exceeds_pending"; pending: number }
  | { kind: "qr_charge_in_progress" };

export type RecordPendingQrPaymentOutcome =
  | { kind: "recorded"; paymentTransactionId: string }
  | PendingQrPaymentRefusal;

export function recordPendingQrPayment(
  { ledger, ids }: RecordPendingQrPaymentPorts,
  { actorId, saleId, amount, occurredAt, waitEndsAt }: RecordPendingQrPaymentInput,
): RecordPendingQrPaymentOutcome {
  return ledger.transaction<RecordPendingQrPaymentOutcome>((tx) => {
    const chargeable = chargeableSale(tx, actorId, saleId, occurredAt);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, pending } = chargeable;
    if (aQrChargeInItsWait(tx.pendingQrPaymentsOf(sale.id), occurredAt)) {
      return { kind: "qr_charge_in_progress" };
    }
    const charge = nonCashCharge(pending, amount);
    if (charge.kind === "invalid_amount" || charge.kind === "exceeds_pending") {
      return charge;
    }

    const paymentTransactionId = ids.next();
    tx.recordPendingQrPayment({
      id: paymentTransactionId,
      saleId: sale.id,
      amount: charge.applied,
      occurredAt,
      waitEndsAt,
    });
    return { kind: "recorded", paymentTransactionId };
  });
}
