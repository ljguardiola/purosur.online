import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { changes } from "../platform/db/schema.js";

type PulledEntity = "branch_settings";

export interface LoggedChange {
  entity: PulledEntity;
  entityId: string;
  version: number;
  op: "insert" | "update";
  originDeviceId?: string;
}

const CHANGE_LOG_LOCK_KEY = "changes_log";

// A sequence value is handed out when the insert runs, not when it commits, so two writers could
// commit out of order and a pull taken in between would move its cursor past the one still
// committing. Holding one lock from the insert until commit makes the order a pull sees the order
// the changes were numbered in.
export async function logChange<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  change: LoggedChange,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${CHANGE_LOG_LOCK_KEY}, 0))`);
  await tx.insert(changes).values({
    entity: change.entity,
    entityId: change.entityId,
    version: change.version,
    op: change.op,
    originDeviceId: change.originDeviceId ?? null,
  });
}
