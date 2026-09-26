import { and, eq, isNull, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../db/schema.js";

export interface EscalateOverdueAlertsDeps {
  now: () => Date;
}

/**
 * The graphile-worker cron task body for alert escalation: turns every open (`resolved_at is
 * null`) Warning alert whose `escalate_at` has passed into Critical, recording the moment it
 * escalated. An alert with no `escalate_at` (a kind that never escalates) and an already-Critical
 * or already-resolved one are left untouched. Returns how many alerts it escalated.
 */
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
