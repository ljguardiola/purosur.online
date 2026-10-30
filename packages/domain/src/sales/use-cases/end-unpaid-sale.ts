import type { SaleLedgerTransaction } from "./sale-ledger.js";

export function endUnpaidSale(tx: SaleLedgerTransaction, saleId: string, occurredAt: Date): void {
  if (tx.hasRecordedPayments(saleId)) {
    tx.recordCancelledSale(saleId, occurredAt, undefined);
  } else {
    tx.discardOpenSale(saleId);
  }
}
