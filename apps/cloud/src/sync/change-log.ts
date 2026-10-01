import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { changes } from "../platform/db/schema.js";

type PulledEntity =
  | "branch_settings"
  | "category"
  | "product"
  | "tag"
  | "price_list"
  | "price"
  | "user"
  | "role"
  | "register"
  | "register_point_of_sale"
  | "discount"
  | "issuer_identification"
  | "buyer_identification_threshold"
  | "buyer_tax_status_set";

interface LoggedChangeFields {
  entityId: string;
  version: number;
  op: "insert" | "update" | "delete";
  originDeviceId?: string;
  priceListId?: string;
}

export type LoggedChange =
  | (LoggedChangeFields & { entity: "user"; locationId: string })
  | (LoggedChangeFields & { entity: Exclude<PulledEntity, "user">; locationId?: never });

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

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
      locationId: change.locationId ?? null,
    })),
  );
}

export function logChange<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  change: LoggedChange,
): Promise<void> {
  return logChanges(tx, [change]);
}

// Writes only note the changes they make here; whoever owns the outermost transaction logs them
// once it has written every row. The log lock is then the last lock that transaction takes, so a
// writer holding row locks never waits on the log while another holds the log and waits on those
// rows.
export class PendingChanges {
  private readonly noted: LoggedChange[] = [];

  note(change: LoggedChange): void {
    this.noted.push(change);
  }

  mark(): number {
    return this.noted.length;
  }

  // For the writes of a nested transaction that rolled back.
  discardSince(mark: number): void {
    this.noted.length = mark;
  }

  log<TQueryResult extends PgQueryResultHKT>(tx: PgDatabase<TQueryResult>): Promise<void> {
    return logChanges(tx, this.noted);
  }
}

// Runs `work` in a transaction and logs what it noted as its last step. A caller that owns an outer
// transaction passes the collector it will log itself, once it has written every row.
export async function withPendingChanges<TQueryResult extends PgQueryResultHKT, TOutcome>(
  db: PgDatabase<TQueryResult>,
  callerOwned: PendingChanges | undefined,
  work: (tx: Transaction<TQueryResult>, pending: PendingChanges) => Promise<TOutcome>,
): Promise<TOutcome> {
  return db.transaction(async (tx) => {
    if (callerOwned === undefined) {
      const pending = new PendingChanges();
      const outcome = await work(tx, pending);
      await pending.log(tx);
      return outcome;
    }
    const mark = callerOwned.mark();
    try {
      return await work(tx, callerOwned);
    } catch (error) {
      callerOwned.discardSince(mark);
      throw error;
    }
  });
}
