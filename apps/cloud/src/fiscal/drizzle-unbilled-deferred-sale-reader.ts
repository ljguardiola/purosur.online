import {
  type DeferredSaleState,
  EXPIRED_DEFERRED_SALE_STATE,
  isUnbilledDeferredSale,
  OPEN_FISCAL_TASK_STATE,
  PENDING_DEFERRED_SALE_STATE,
} from "@purosur/domain";
import type {
  UnbilledDeferredSaleReader,
  UnbilledDeferredSales,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deferredSales, fiscalTasks } from "../platform/db/schema.js";

export class DrizzleUnbilledDeferredSaleReader<TQueryResult extends PgQueryResultHKT>
  implements UnbilledDeferredSaleReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async unbilledDeferredSalesOfBranch(locationId: string): Promise<UnbilledDeferredSales> {
    const candidates = await this.db
      .select({
        state: deferredSales.state,
        occurredAt: deferredSales.occurredAt,
        openTaskId: fiscalTasks.id,
      })
      .from(deferredSales)
      .leftJoin(
        fiscalTasks,
        and(
          eq(fiscalTasks.deferredSaleId, deferredSales.id),
          eq(fiscalTasks.state, OPEN_FISCAL_TASK_STATE),
        ),
      )
      .where(
        and(
          eq(deferredSales.locationId, locationId),
          inArray(deferredSales.state, [PENDING_DEFERRED_SALE_STATE, EXPIRED_DEFERRED_SALE_STATE]),
        ),
      );
    const unbilled = candidates.filter(({ state, openTaskId }) =>
      isUnbilledDeferredSale({
        state: state as DeferredSaleState,
        regularizationTaskOpen: openTaskId !== null,
      }),
    );
    const oldest = unbilled.reduce<Date | null>(
      (earliest, { occurredAt }) =>
        earliest === null || occurredAt.getTime() < earliest.getTime() ? occurredAt : earliest,
      null,
    );
    return { count: unbilled.length, oldestOccurredAt: oldest };
  }
}
