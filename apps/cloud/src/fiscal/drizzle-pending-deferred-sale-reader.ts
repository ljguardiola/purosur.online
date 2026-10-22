import { PENDING_DEFERRED_SALE_STATE } from "@purosur/domain";
import type {
  DeferredSaleDeadlineReader,
  PendingDeferredSaleForAlert,
} from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deferredSales } from "../platform/db/schema.js";

export class DrizzlePendingDeferredSaleReader<TQueryResult extends PgQueryResultHKT>
  implements DeferredSaleDeadlineReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  pendingDeferredSales(): Promise<PendingDeferredSaleForAlert[]> {
    return this.db
      .select({
        id: deferredSales.id,
        saleId: deferredSales.saleId,
        registerId: deferredSales.registerId,
        locationId: deferredSales.locationId,
        occurredAt: deferredSales.occurredAt,
        total: deferredSales.total,
        shortCode: deferredSales.shortCode,
      })
      .from(deferredSales)
      .where(eq(deferredSales.state, PENDING_DEFERRED_SALE_STATE));
  }
}
