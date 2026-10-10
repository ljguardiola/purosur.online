import { saleLinesLock } from "../model/open-sale-standing.js";
import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function saleLinesLocked(tx: SaleLedgerTransaction, saleId: string, now: Date): boolean {
  return saleLinesLock(tx.salePayments(saleId), tx.pendingQrPaymentsOf(saleId), now) !== null;
}
