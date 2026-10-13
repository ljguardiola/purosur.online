import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export async function lockDeviceQuarantines<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  deviceId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`device_quarantines:${deviceId}`}, 0))`,
  );
}
