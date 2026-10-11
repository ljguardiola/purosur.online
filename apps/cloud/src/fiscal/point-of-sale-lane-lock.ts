import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";

function pointOfSaleLaneLockKey(pointOfSale: number): string {
  return `fiscal_point_of_sale_lane:${pointOfSale}`;
}

// The lock is the connection's own, held until the work ends, so what one lane's work reads and
// writes on that connection is never interleaved with another lane's work at the same point of sale.
export function withPointOfSaleLaneLock<TQueryResult extends PgQueryResultHKT, TOutcome>(
  connections: DedicatedConnections<TQueryResult>,
  pointOfSale: number,
  work: (db: PgDatabase<TQueryResult>) => Promise<TOutcome>,
): Promise<TOutcome> {
  return connections.withConnection(async (db) => {
    const key = sql`hashtextextended(${pointOfSaleLaneLockKey(pointOfSale)}, 0)`;
    await db.execute(sql`select pg_advisory_lock(${key})`);
    try {
      return await work(db);
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${key})`);
    }
  });
}
