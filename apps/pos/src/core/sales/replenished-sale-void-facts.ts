import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import {
  cancelDeferredSale,
  readUncancelledDeferredSaleRecord,
} from "../fiscal/sqlite-deferred-sales";
import { insertPaymentRefund } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { addToStockBalance, insertSaleVoidStockMovement } from "../stock/sqlite-stock-ledger";
import { holdSaleCashMovements } from "./replenished-sale-facts";
import { markSaleVoided } from "./sqlite-sale-void-ledger";

type VoidedSaleFact = Extract<SyncedFact, { kind: "sale_voided" }>;

export function applyReplenishedSaleVoidFact(
  database: LocalDatabase,
  { sale }: VoidedSaleFact,
): void {
  const recorded = database
    .prepare<[string], { state: string }>("SELECT state FROM sales WHERE id = ?")
    .get(sale.id);
  if (recorded === undefined) {
    throw new Error(`sale ${sale.id} is not held`);
  }
  if (recorded.state === "VOIDED") {
    return;
  }
  markSaleVoided(database, sale.id, sale.voidedAt, sale.authorizedBy ?? undefined);
  for (const refund of sale.refunds) {
    const held = database.prepare("SELECT 1 FROM payment_refunds WHERE id = ?").get(refund.id);
    if (held === undefined) {
      insertPaymentRefund(database, { ...refund, saleId: sale.id });
    }
  }
  holdSaleCashMovements(database, sale);
  for (const movement of sale.stockMovements) {
    const held = database.prepare("SELECT 1 FROM stock_movements WHERE id = ?").get(movement.id);
    if (held === undefined) {
      insertSaleVoidStockMovement(database, { ...movement, occurredAt: sale.voidedAt });
      addToStockBalance(database, movement.productId, movement.delta);
    }
  }
  if (
    sale.deferredRecordCancelled &&
    readUncancelledDeferredSaleRecord(database, sale.id) !== null
  ) {
    cancelDeferredSale(database, sale.id, sale.voidedAt);
  }
}
