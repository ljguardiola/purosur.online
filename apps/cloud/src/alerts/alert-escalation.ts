import { and, eq, isNull, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../db/schema.js";

export interface EscalateOverdueAlertsDeps {
  now: () => Date;
}

export async function escalateOverdueAlerts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: EscalateOverdueAlertsDeps,
): Promise<number> {
  const now = deps.now();
  const escalated = await db
    .update(alerts)
    .set({ level: "critical", escalatedAt: now })
    .where(and(eq(alerts.level, "warning"), isNull(alerts.resolvedAt), lte(alerts.escalateAt, now)))
    .returning({ id: alerts.id });
  return escalated.length;
}
