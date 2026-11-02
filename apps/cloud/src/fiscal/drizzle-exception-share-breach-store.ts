import type {
  ExceptionShareBreachStore,
  ExceptionShareBreachTransaction,
  ExceptionShareMonth,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { exceptionShareBreaches } from "../platform/db/schema.js";
import { monthlyVoucherCounts } from "./drizzle-exception-share-voucher-counts.js";

export const EXCEPTION_SHARE_BREACH_LOCK_KEY = "exception_share_breach";

class DrizzleExceptionShareBreachTransaction<TQueryResult extends PgQueryResultHKT>
  implements ExceptionShareBreachTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockMonthlyVoucherCounts(window: {
    from: string;
    through: string;
  }): Promise<ExceptionShareMonth[]> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${EXCEPTION_SHARE_BREACH_LOCK_KEY}, 0))`,
    );
    return monthlyVoucherCounts(this.tx, { months: window });
  }

  recordedBreaches(window: { from: string; through: string }): Promise<ExceptionShareMonth[]> {
    return this.tx
      .select({
        fiscalAddressId: sql<string>`${exceptionShareBreaches.fiscalAddressId}::text`,
        month: exceptionShareBreaches.month,
        exceptionCount: exceptionShareBreaches.exceptionCount,
        totalCount: exceptionShareBreaches.totalCount,
      })
      .from(exceptionShareBreaches)
      .where(
        sql`${exceptionShareBreaches.month} >= ${window.from} and ${exceptionShareBreaches.month} <= ${window.through}`,
      );
  }

  async recordBreach(breach: ExceptionShareMonth): Promise<void> {
    const at = this.now();
    await this.tx
      .insert(exceptionShareBreaches)
      .values({ ...breach, recordedAt: at, updatedAt: at });
  }

  async updateRecordedBreach({
    fiscalAddressId,
    month,
    exceptionCount,
    totalCount,
  }: ExceptionShareMonth): Promise<void> {
    await this.tx
      .update(exceptionShareBreaches)
      .set({ exceptionCount, totalCount, updatedAt: this.now() })
      .where(
        and(
          eq(exceptionShareBreaches.fiscalAddressId, fiscalAddressId),
          eq(exceptionShareBreaches.month, month),
        ),
      );
  }
}

export class DrizzleExceptionShareBreachStore<TQueryResult extends PgQueryResultHKT>
  implements ExceptionShareBreachStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (transaction: ExceptionShareBreachTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleExceptionShareBreachTransaction(tx, this.now)),
    );
  }
}
