import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { contingencyTicketRecoveries } from "../../platform/db/schema.js";

export async function insertContingencyTicketRecovery<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  recovery: {
    registerId: string;
    restoredDeviceId: string;
    openedAt: Date;
    finishedAt?: Date;
    finishedBy?: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(contingencyTicketRecoveries)
    .values({
      registerId: recovery.registerId,
      restoredDeviceId: recovery.restoredDeviceId,
      openedAt: recovery.openedAt,
      finishedAt: recovery.finishedAt ?? null,
      finishedBy: recovery.finishedBy ?? null,
    })
    .returning({ id: contingencyTicketRecoveries.id });
  if (!row) {
    throw new Error("test setup: seeding the contingency ticket recovery returned no row");
  }
  return row.id;
}
