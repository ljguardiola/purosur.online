import { type BuyerIdentificationThreshold, thresholdInEffectOn } from "@purosur/domain";
import type {
  BuyerIdentificationThresholdStore,
  BuyerIdentificationThresholdStoreTransaction,
  NewBuyerIdentificationThreshold,
} from "@purosur/domain/fiscal/use-cases";
import { eq, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, buyerIdentificationThresholds } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

export const BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY = "buyer_identification_threshold";

const THRESHOLD_VERSION = 1;

const storedThreshold = {
  id: buyerIdentificationThresholds.id,
  amount: buyerIdentificationThresholds.amount,
  validFrom: buyerIdentificationThresholds.validFrom,
  revision: buyerIdentificationThresholds.revision,
};

function auditedValue(threshold: BuyerIdentificationThreshold) {
  return {
    amount: threshold.amount,
    valid_from: threshold.validFrom,
    revision: threshold.revision,
  };
}

class DrizzleBuyerIdentificationThresholdStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements BuyerIdentificationThresholdStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date, pending: PendingChanges) {
    this.tx = tx;
    this.now = now;
    this.pending = pending;
  }

  async lockBuyerIdentificationThresholds(): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY}, 0))`,
    );
  }

  async readThresholdStartingOn(day: string): Promise<BuyerIdentificationThreshold | undefined> {
    const startingOnDay = await this.tx
      .select(storedThreshold)
      .from(buyerIdentificationThresholds)
      .where(eq(buyerIdentificationThresholds.validFrom, day));
    return thresholdInEffectOn(startingOnDay, day);
  }

  async readThresholdInEffectOn(day: string): Promise<BuyerIdentificationThreshold | undefined> {
    const started = await this.tx
      .select(storedThreshold)
      .from(buyerIdentificationThresholds)
      .where(lte(buyerIdentificationThresholds.validFrom, day));
    return thresholdInEffectOn(started, day);
  }

  async recordBuyerIdentificationThreshold(
    threshold: NewBuyerIdentificationThreshold,
  ): Promise<BuyerIdentificationThreshold> {
    const [recorded] = await this.tx
      .insert(buyerIdentificationThresholds)
      .values({
        amount: threshold.amount,
        validFrom: threshold.validFrom,
        revision: threshold.revision,
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
      previousValue: threshold.replaced && auditedValue(threshold.replaced),
      newValue: auditedValue(recorded),
      at: this.now(),
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
  private readonly now: () => Date;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date, pending?: PendingChanges) {
    this.db = db;
    this.now = now;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: BuyerIdentificationThresholdStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleBuyerIdentificationThresholdStoreTransaction(tx, this.now, pending)),
    );
  }
}
