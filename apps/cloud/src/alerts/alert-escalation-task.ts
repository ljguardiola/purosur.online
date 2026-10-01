import { escalateOverdueAlerts } from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

export const ALERT_ESCALATION_TASK_IDENTIFIER = "alert-escalation";

export const ALERT_ESCALATION_CRONTAB_LINE = `*/5 * * * * ${ALERT_ESCALATION_TASK_IDENTIFIER}`;

export function escalateAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return escalateOverdueAlerts({ store: new DrizzleAlertStore(db), clock: { now: deps.now } });
}
