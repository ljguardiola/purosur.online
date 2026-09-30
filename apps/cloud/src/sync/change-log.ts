import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { changes } from "../platform/db/schema.js";

type PulledEntity = "branch_settings" | "category" | "product" | "tag" | "price_list" | "price";

export interface LoggedChange {
  entity: PulledEntity;
  entityId: string;
  version: number;
  op: "insert" | "update" | "delete";
  originDeviceId?: string;
  priceListId?: string;
}

const CHANGE_LOG_LOCK_KEY = "changes_log";

// A sequence value is handed out when the insert runs, not when it commits, so two writers could
// commit out of order and a pull taken in between would move its cursor past the one still
// committing. Holding one lock from the insert until commit makes the order a pull sees the order
// the changes were numbered in.
export async function logChanges<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  changesToLog: readonly LoggedChange[],
): Promise<void> {
  if (changesToLog.length === 0) {
    return;
  }
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${CHANGE_LOG_LOCK_KEY}, 0))`);
  await tx.insert(changes).values(
    changesToLog.map((change) => ({
      entity: change.entity,
      entityId: change.entityId,
      version: change.version,
      op: change.op,
      originDeviceId: change.originDeviceId ?? null,
      priceListId: change.priceListId ?? null,
    })),
  );
}

export function logChange<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  change: LoggedChange,
): Promise<void> {
  return logChanges(tx, [change]);
}

// A store's writes only note the changes they make here; the store logs them once its operation
// has written every row. The log lock is then the last lock the operation takes, so a writer
// holding row locks never waits on the log while another holds the log and waits on those rows.
export class PendingChanges {
  private readonly noted: LoggedChange[] = [];

  note(change: LoggedChange): void {
    this.noted.push(change);
  }

  log<TQueryResult extends PgQueryResultHKT>(tx: PgDatabase<TQueryResult>): Promise<void> {
    return logChanges(tx, this.noted);
  }
}
