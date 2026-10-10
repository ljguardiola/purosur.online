import { saleLinesLockedBy } from "../model/open-sale-standing.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function saleLinesLocked(tx: SaleLedgerTransaction, saleId: string, now: Date): boolean {
  return saleLinesLockedBy(tx.salePayments(saleId), tx.pendingQrPaymentsOf(saleId), now);
}
