import type {
  PublishedZoneRules,
  ZoneRulesStore,
  ZoneRulesStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { zoneRules } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const ZONE_RULES_LOCK_KEY = "zone_rules";

export async function latestPublishedZoneRulesVersion<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string | null> {
  const [latest] = await db
    .select({ version: zoneRules.version })
    .from(zoneRules)
    .orderBy(desc(zoneRules.publishedAt), desc(zoneRules.version))
    .limit(1);
  return latest?.version ?? null;
}

class DrizzleZoneRulesStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements ZoneRulesStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockZoneRulesPublication(): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${ZONE_RULES_LOCK_KEY}, 0))`,
    );
  }

  async isZoneRulesVersionPublished(version: string): Promise<boolean> {
    const rows = await this.tx
      .select({ id: zoneRules.id })
      .from(zoneRules)
      .where(eq(zoneRules.version, version))
      .limit(1);
    return rows.length > 0;
  }

  async publishZoneRules({ version, transitions, publishedAt }: PublishedZoneRules): Promise<void> {
    const [published] = await this.tx
      .insert(zoneRules)
      .values({
        version,
        transitions: transitions.map(({ from, offsetMinutes }) => ({
          from: from.toISOString(),
          offsetMinutes,
        })),
        publishedAt,
      })
      .returning({ id: zoneRules.id });
    if (!published) {
      throw new Error("inserting the zone rules returned no row");
    }
    this.pending.note({ entity: "zone_rules", entityId: published.id, version: 1, op: "insert" });
  }
}

export class DrizzleZoneRulesStore<TQueryResult extends PgQueryResultHKT>
  implements ZoneRulesStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: ZoneRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleZoneRulesStoreTransaction(tx, pending)),
    );
  }
}
