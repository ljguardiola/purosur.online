import {
  type DeferredSaleRegularizationTask,
  EXPIRED_DEFERRED_SALE_STATE,
  PENDING_DEFERRED_SALE_STATE,
} from "@purosur/domain";
import type {
  DeferredSaleExpiryStore,
  DeferredSaleExpiryTransaction,
  PendingDeferredSale,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, lt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deferredSales, fiscalTasks } from "../platform/db/schema.js";

class DrizzleDeferredSaleExpiryTransaction<TQueryResult extends PgQueryResultHKT>
  implements DeferredSaleExpiryTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  lockPendingDeferredSalesOccurredBefore(instant: Date): Promise<PendingDeferredSale[]> {
    return this.tx
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
      .where(
        and(
          eq(deferredSales.state, PENDING_DEFERRED_SALE_STATE),
          lt(deferredSales.occurredAt, instant),
        ),
      )
      .orderBy(asc(deferredSales.occurredAt), asc(deferredSales.id))
      .for("update", { skipLocked: true });
  }

  async recordExpiry(deferredSaleId: string, task: DeferredSaleRegularizationTask): Promise<void> {
    await this.tx
      .update(deferredSales)
      .set({ state: EXPIRED_DEFERRED_SALE_STATE, expiredAt: task.createdAt })
      .where(eq(deferredSales.id, deferredSaleId));
    await this.tx.insert(fiscalTasks).values({
      id: crypto.randomUUID(),
      kind: task.kind,
      registerId: task.registerId,
      deferredSaleId: task.deferredSaleId,
      reason: {
        saleOccurredAt: task.saleOccurredAt.toISOString(),
        total: task.total,
        shortCode: task.shortCode,
      },
      state: task.state,
      createdAt: task.createdAt,
    });
  }
}

export class DrizzleDeferredSaleExpiryStore<TQueryResult extends PgQueryResultHKT>
  implements DeferredSaleExpiryStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (transaction: DeferredSaleExpiryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleDeferredSaleExpiryTransaction(tx)));
  }
}
