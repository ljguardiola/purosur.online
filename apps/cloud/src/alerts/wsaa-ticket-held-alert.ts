import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "./open-alert.js";
import { resolveOpenAlertOf } from "./resolve-open-alert-of.js";

const WSAA_TICKET_HELD_ALERT_KIND = "arca_wsaa_ticket_held";

export async function openWsaaTicketHeldAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  environment: string,
  retryIntervalMinutes: number,
  at: Date,
): Promise<void> {
  await openAlert(
    tx,
    {
      kind: WSAA_TICKET_HELD_ALERT_KIND,
      scope: environment,
      detail: { retryIntervalMinutes },
    },
    { now: () => at },
  );
}

export function resolveWsaaTicketHeldAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  environment: string,
  at: Date,
): Promise<void> {
  return resolveOpenAlertOf(
    tx,
    { kind: WSAA_TICKET_HELD_ALERT_KIND, scope: environment },
    { now: () => at },
  );
}
