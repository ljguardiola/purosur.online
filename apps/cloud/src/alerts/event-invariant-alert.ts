import type { EventInvariantBreaks } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "./open-alert.js";

export async function openEventInvariantAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  found: EventInvariantBreaks,
  at: Date,
): Promise<void> {
  await openAlert(
    tx,
    { kind: "event_invariant_violated", scope: found.eventId, detail: found },
    { now: () => at },
  );
}
