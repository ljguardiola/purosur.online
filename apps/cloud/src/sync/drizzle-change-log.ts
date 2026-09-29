import type { ChangeLog, ChangeLogTransaction } from "@purosur/domain/sync/use-cases";
import { and, asc, eq, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  type BranchSettingsRow,
  readBranchSettings,
} from "../branch/branch-settings-read-route.js";
import { changes, deviceState } from "../platform/db/schema.js";

export interface PulledBranchSettingsChange {
  changeSeq: number;
  entity: "branch_settings";
  entityId: string;
  row: BranchSettingsRow;
}

class DrizzleChangeLogTransaction<TQueryResult extends PgQueryResultHKT>
  implements ChangeLogTransaction<PulledBranchSettingsChange>
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async recordObservedPull(deviceId: string, since: number, at: Date): Promise<void> {
    await this.tx
      .insert(deviceState)
      .values({ deviceId, lastPullSince: since, lastPulledAt: at })
      .onConflictDoUpdate({
        target: deviceState.deviceId,
        set: { lastPullSince: since, lastPulledAt: at },
      });
  }

  async changesAfter(
    locationId: string,
    since: number,
    limit: number,
  ): Promise<PulledBranchSettingsChange[]> {
    const logged = await this.tx
      .select({ changeSeq: changes.changeSeq, entityId: changes.entityId })
      .from(changes)
      .where(
        and(
          eq(changes.entity, "branch_settings"),
          eq(changes.entityId, locationId),
          gt(changes.changeSeq, since),
        ),
      )
      .orderBy(asc(changes.changeSeq))
      .limit(limit);

    // Every change carries the row as it is now, so one read serves every change of that row.
    const rows = new Map<string, BranchSettingsRow>();
    const pulled: PulledBranchSettingsChange[] = [];
    for (const { changeSeq, entityId } of logged) {
      let row = rows.get(entityId);
      if (row === undefined) {
        row = await readBranchSettings(this.tx, entityId);
        rows.set(entityId, row);
      }
      pulled.push({ changeSeq, entity: "branch_settings", entityId, row });
    }
    return pulled;
  }
}

export class DrizzleChangeLog<TQueryResult extends PgQueryResultHKT>
  implements ChangeLog<PulledBranchSettingsChange>
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // Repeatable read: a branch's settings and its hours are read in two queries, which must not
  // straddle a save committing between them.
  transaction<TOutcome>(
    work: (tx: ChangeLogTransaction<PulledBranchSettingsChange>) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleChangeLogTransaction(tx)), {
      isolationLevel: "repeatable read",
    });
  }
}
