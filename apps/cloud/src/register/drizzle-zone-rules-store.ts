import { currentZoneRulesPublication, type ZoneRulesPublication } from "@purosur/domain";
import type {
  CurrentZoneRules,
  CurrentZoneRulesReader,
  PublishedZoneRules,
  ZoneRulesStore,
  ZoneRulesStoreTransaction,
} from "@purosur/domain/register/use-cases";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { zoneRules } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const ZONE_RULES_LOCK_KEY = "zone_rules";

function zoneRulesPublications<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<ZoneRulesPublication[]> {
  return db
    .select({ version: zoneRules.version, publicationNumber: zoneRules.publicationNumber })
    .from(zoneRules);
}

function storedZoneRules<TQueryResult extends PgQueryResultHKT>(db: PgDatabase<TQueryResult>) {
  return db
    .select({
      version: zoneRules.version,
      publicationNumber: zoneRules.publicationNumber,
      transitions: zoneRules.transitions,
    })
    .from(zoneRules);
}

export class DrizzlePublishedZoneRulesReader<TQueryResult extends PgQueryResultHKT>
  implements CurrentZoneRulesReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async currentZoneRulesVersion(): Promise<string | null> {
    return currentZoneRulesPublication(await zoneRulesPublications(this.db))?.version ?? null;
  }

  async currentZoneRules(): Promise<CurrentZoneRules | null> {
    const current = currentZoneRulesPublication(await storedZoneRules(this.db));
    if (current === undefined) {
      return null;
    }
    return {
      version: current.version,
      transitions: current.transitions.map(({ from, offsetMinutes }) => ({
        from: new Date(from),
        offsetMinutes,
      })),
    };
  }
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

  zoneRulesPublications(): Promise<ZoneRulesPublication[]> {
    return zoneRulesPublications(this.tx);
  }

  async publishZoneRules({
    version,
    transitions,
    publicationNumber,
  }: PublishedZoneRules): Promise<void> {
    const [published] = await this.tx
      .insert(zoneRules)
      .values({
        version,
        transitions: transitions.map(({ from, offsetMinutes }) => ({
          from: from.toISOString(),
          offsetMinutes,
        })),
        publicationNumber,
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
