import { PENDING_DEFERRED_SALE_STATE } from "@purosur/domain";
import type {
  PendingDeferredSale,
  PendingDeferredSaleReader,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deferredSales } from "../platform/db/schema.js";

export class DrizzlePendingDeferredSaleReader<TQueryResult extends PgQueryResultHKT>
  implements PendingDeferredSaleReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  pendingDeferredSales(): Promise<PendingDeferredSale[]> {
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
