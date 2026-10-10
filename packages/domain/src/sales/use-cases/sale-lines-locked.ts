import { aQrChargeInItsWait, hasApprovedPayment } from "../../payments/index.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function saleLinesLocked(tx: SaleLedgerTransaction, saleId: string, now: Date): boolean {
  return (
    hasApprovedPayment(tx.salePayments(saleId)) ||
    aQrChargeInItsWait(tx.pendingQrPaymentsOf(saleId), now)
  );
}
