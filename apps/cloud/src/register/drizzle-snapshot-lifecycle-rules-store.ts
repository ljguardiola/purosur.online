import type { SnapshotLifecycleRules } from "@purosur/domain";
import type {
  SnapshotLifecycleRulesChange,
  SnapshotLifecycleRulesStore,
  SnapshotLifecycleRulesStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, registerSnapshotLifecycleRules } from "../platform/db/schema.js";

export const SNAPSHOT_LIFECYCLE_RULES_SINGLETON_ID = "00000000-0000-0000-0000-000000000002";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleSnapshotLifecycleRulesTransaction<TQueryResult extends PgQueryResultHKT>
  implements SnapshotLifecycleRulesStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  // The rules have no row to lock before their first change.
  async lockLifecycleRules(): Promise<SnapshotLifecycleRules | undefined> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"snapshot_lifecycle_rules"}, 0))`,
    );
    const [row] = await this.tx
      .select({
        hourly: registerSnapshotLifecycleRules.hourly,
        daily: registerSnapshotLifecycleRules.daily,
        monthly: registerSnapshotLifecycleRules.monthly,
      })
      .from(registerSnapshotLifecycleRules);
    return row;
  }

  async recordLifecycleRulesChange(change: SnapshotLifecycleRulesChange): Promise<void> {
    const { hourly, daily, monthly } = change.next;
    await this.tx
      .insert(registerSnapshotLifecycleRules)
      .values({ hourly, daily, monthly })
      .onConflictDoUpdate({
        target: registerSnapshotLifecycleRules.singleton,
        set: { hourly, daily, monthly },
      });
    await this.tx.insert(auditLog).values({
      entity: "register_snapshot_lifecycle_rules",
      entityId: SNAPSHOT_LIFECYCLE_RULES_SINGLETON_ID,
      actorId: change.actorId,
      previousValue: change.previous,
      newValue: change.next,
      at: this.now(),
    });
  }
}

export class DrizzleSnapshotLifecycleRulesStore<TQueryResult extends PgQueryResultHKT>
  implements SnapshotLifecycleRulesStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: SnapshotLifecycleRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleSnapshotLifecycleRulesTransaction(tx, this.now)),
    );
  }
}
