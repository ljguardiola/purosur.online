import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../platform/db/schema.js";
import { openAlertCondition } from "./open-alert-condition.js";
import { type ResolveAlertDeps, resolveAlert } from "./resolve-alert.js";

export async function resolveOpenAlertOf<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { kind, scope }: { kind: string; scope: string },
  deps: ResolveAlertDeps,
): Promise<void> {
  const [open] = await tx
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.kind, kind), eq(alerts.scope, scope), openAlertCondition()))
    .for("update");
  if (open !== undefined) {
    await resolveAlert(tx, open.id, deps);
  }
}
