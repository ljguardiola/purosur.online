import type {
  BuyerTaxStatusSetVersion,
  BuyerTaxStatusStore,
  BuyerTaxStatusStoreTransaction,
} from "@purosur/domain/fiscal/use-cases";
import { desc, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { buyerTaxStatusSets } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

export const BUYER_TAX_STATUS_SET_LOCK_KEY = "buyer_tax_status_set";

class DrizzleBuyerTaxStatusStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements BuyerTaxStatusStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockCurrentBuyerTaxStatusSet(): Promise<BuyerTaxStatusSetVersion | undefined> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${BUYER_TAX_STATUS_SET_LOCK_KEY}, 0))`,
    );
    const [current] = await this.tx
      .select({
        paramsVersion: buyerTaxStatusSets.paramsVersion,
        options: buyerTaxStatusSets.options,
      })
      .from(buyerTaxStatusSets)
      .orderBy(desc(buyerTaxStatusSets.paramsVersion))
      .limit(1);
    return current;
  }

  async recordBuyerTaxStatusSet(set: BuyerTaxStatusSetVersion): Promise<void> {
    const [recorded] = await this.tx
      .insert(buyerTaxStatusSets)
      .values({ paramsVersion: set.paramsVersion, options: set.options })
      .returning({ id: buyerTaxStatusSets.id });
    if (!recorded) {
      throw new Error("inserting the buyer tax-status set returned no row");
    }
    this.pending.note({
      entity: "buyer_tax_status_set",
      entityId: recorded.id,
      version: set.paramsVersion,
      op: "insert",
    });
  }
}

export class DrizzleBuyerTaxStatusStore<TQueryResult extends PgQueryResultHKT>
  implements BuyerTaxStatusStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: BuyerTaxStatusStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleBuyerTaxStatusStoreTransaction(tx, pending)),
    );
  }
}
