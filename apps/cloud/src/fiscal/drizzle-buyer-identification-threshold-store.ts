import type { BuyerIdentificationThreshold } from "@purosur/domain";
import type {
  BuyerIdentificationThresholdStore,
  BuyerIdentificationThresholdStoreTransaction,
  NewBuyerIdentificationThreshold,
} from "@purosur/domain/fiscal/use-cases";
import { desc, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, buyerIdentificationThresholds } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

export const BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY = "buyer_identification_threshold";

const THRESHOLD_VERSION = 1;

const storedThreshold = {
  id: buyerIdentificationThresholds.id,
  amount: buyerIdentificationThresholds.amount,
  validFrom: buyerIdentificationThresholds.validFrom,
};

class DrizzleBuyerIdentificationThresholdStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements BuyerIdentificationThresholdStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockLatestBuyerIdentificationThreshold(): Promise<
    BuyerIdentificationThreshold | undefined
  > {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY}, 0))`,
    );
    const [latest] = await this.tx
      .select(storedThreshold)
      .from(buyerIdentificationThresholds)
      .orderBy(desc(buyerIdentificationThresholds.validFrom))
      .limit(1);
    return latest;
  }

  async recordBuyerIdentificationThreshold(
    threshold: NewBuyerIdentificationThreshold,
  ): Promise<BuyerIdentificationThreshold> {
    const [recorded] = await this.tx
      .insert(buyerIdentificationThresholds)
      .values({
        amount: threshold.amount,
        validFrom: threshold.validFrom,
        recordedBy: threshold.actorId,
      })
      .returning(storedThreshold);
    if (!recorded) {
      throw new Error("inserting the buyer-identification threshold returned no row");
    }
    await this.tx.insert(auditLog).values({
      entity: "buyer_identification_threshold",
      entityId: recorded.id,
      actorId: threshold.actorId,
      previousValue: null,
      newValue: { amount: recorded.amount, valid_from: recorded.validFrom },
    });
    this.pending.note({
      entity: "buyer_identification_threshold",
      entityId: recorded.id,
      version: THRESHOLD_VERSION,
      op: "insert",
    });
    return recorded;
  }
}

export class DrizzleBuyerIdentificationThresholdStore<TQueryResult extends PgQueryResultHKT>
  implements BuyerIdentificationThresholdStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: BuyerIdentificationThresholdStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleBuyerIdentificationThresholdStoreTransaction(tx, pending)),
    );
  }
}
