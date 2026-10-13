import type { DeferredSale } from "@purosur/domain";
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
