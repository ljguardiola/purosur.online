import type { DeferredSale, DeferredSaleRecord } from "@purosur/domain";
import { ShortCodeTaken } from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

const SHORT_CODE_UNIQUE_INDEX = "UNIQUE constraint failed: deferred_sales.short_code";

export function insertDeferredSale(database: LocalDatabase, sale: DeferredSale): void {
  try {
    database
      .prepare(
        `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
         VALUES (@id, @sale_id, @occurred_at, @total, @reason, @short_code, @routed_at)`,
      )
      .run({
        id: sale.id,
        sale_id: sale.saleId,
        occurred_at: sale.occurredAt.toISOString(),
        total: sale.total,
        reason: sale.reason,
        short_code: sale.shortCode,
        routed_at: sale.routedAt.toISOString(),
      });
  } catch (error) {
    if (error instanceof Error && error.message === SHORT_CODE_UNIQUE_INDEX) {
      throw new ShortCodeTaken();
    }
    throw error;
  }
}

export function readUncancelledDeferredSaleRecord(
  database: LocalDatabase,
  saleId: string,
): DeferredSaleRecord | null {
  const row = database
    .prepare<[string], { satisfied: 0 | 1 }>(
      `SELECT (satisfied_at IS NOT NULL) AS satisfied FROM deferred_sales
       WHERE sale_id = ? AND cancelled_at IS NULL`,
    )
    .get(saleId);
  return row === undefined ? null : { satisfied: row.satisfied === 1 };
}

export function cancelDeferredSale(
  database: LocalDatabase,
  saleId: string,
  cancelledAt: Date,
): void {
  const { changes } = database
    .prepare(
      `UPDATE deferred_sales SET cancelled_at = ?
       WHERE sale_id = ? AND satisfied_at IS NULL AND cancelled_at IS NULL`,
    )
    .run(cancelledAt.toISOString(), saleId);
  if (changes !== 1) {
    throw new Error("the sale has no pending deferred record");
  }
}
