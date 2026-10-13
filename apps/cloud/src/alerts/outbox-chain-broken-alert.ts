import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "./open-alert.js";

export async function openOutboxChainBrokenAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  broken: { deviceId: string; refusedEventCount: number },
  at: Date,
): Promise<void> {
  await openAlert(
    tx,
    { kind: "outbox_chain_broken", scope: broken.deviceId, detail: broken },
    { now: () => at },
  );
}
