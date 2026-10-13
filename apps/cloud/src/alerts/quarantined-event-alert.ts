import type { EventQuarantine } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "./open-alert.js";
import { resolveOpenAlertOf } from "./resolve-open-alert-of.js";

const QUARANTINED_EVENT_ALERT_KIND = "events_quarantined";

export async function openQuarantinedEventAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  quarantine: EventQuarantine,
  at: Date,
): Promise<void> {
  await openAlert(
    tx,
    {
      kind: QUARANTINED_EVENT_ALERT_KIND,
      scope: quarantine.deviceId,
      detail: { deviceId: quarantine.deviceId },
    },
    { now: () => at },
  );
}

export function resolveQuarantinedEventAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  deviceId: string,
  at: Date,
): Promise<void> {
  return resolveOpenAlertOf(
    tx,
    { kind: QUARANTINED_EVENT_ALERT_KIND, scope: deviceId },
    { now: () => at },
  );
}
