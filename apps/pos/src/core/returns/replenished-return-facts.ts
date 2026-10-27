import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { insertPaymentRefund } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement } from "../register/sqlite-cash-ledger";
import { addToStockBalance, insertReturnStockMovement } from "../stock/sqlite-stock-ledger";
import { insertReturn } from "./sqlite-return-ledger";

type ReturnedSaleFact = Extract<SyncedFact, { kind: "sale_returned" }>;

function held(database: LocalDatabase, query: string, id: string): boolean {
  return database.prepare(query).get(id) !== undefined;
}

export function applyReplenishedReturnFact(
  database: LocalDatabase,
  { saleReturn }: ReturnedSaleFact,
): void {
  if (!held(database, "SELECT 1 FROM sales WHERE id = ?", saleReturn.saleId)) {
    throw new Error(`sale ${saleReturn.saleId} is not held`);
  }
  if (held(database, "SELECT 1 FROM returns WHERE id = ?", saleReturn.id)) {
    return;
  }
  insertReturn(database, {
    ...saleReturn,
    refundedTotal: saleReturn.lines.reduce((total, line) => total + line.refundedAmount, 0),
  });
  for (const refund of saleReturn.refunds) {
    if (!held(database, "SELECT 1 FROM payment_refunds WHERE id = ?", refund.id)) {
      insertPaymentRefund(database, { ...refund, saleId: saleReturn.saleId });
    }
  }
  for (const movement of saleReturn.cashMovements) {
    if (!held(database, "SELECT 1 FROM cash_movements WHERE id = ?", movement.id)) {
      insertCashMovement(database, {
        ...movement,
        sessionId: saleReturn.sessionId,
        ref: { type: "return", id: saleReturn.id },
      });
    }
  }
  for (const movement of saleReturn.stockMovements) {
    if (!held(database, "SELECT 1 FROM stock_movements WHERE id = ?", movement.id)) {
      insertReturnStockMovement(database, {
        ...movement,
        returnId: saleReturn.id,
        occurredAt: saleReturn.occurredAt,
      });
      addToStockBalance(database, movement.productId, movement.delta);
    }
  }
}
