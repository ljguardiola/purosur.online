import { asc, desc, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { changes } from "../../platform/db/schema.js";

export async function lastLoggedChangeSeq<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<number> {
  const [last] = await db
    .select({ changeSeq: changes.changeSeq })
    .from(changes)
    .orderBy(desc(changes.changeSeq))
    .limit(1);
  return last?.changeSeq ?? 0;
}

export async function changesLoggedAfter<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  changeSeq: number,
) {
  return db
    .select({
      entity: changes.entity,
      entityId: changes.entityId,
      version: changes.version,
      op: changes.op,
      locationId: changes.locationId,
    })
    .from(changes)
    .where(gt(changes.changeSeq, changeSeq))
    .orderBy(asc(changes.changeSeq));
}
