import { fiscalUnknownAlertKey } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { resolveOpenAlertOf } from "./resolve-open-alert-of.js";

export function resolveUnclearOutcomeAlert<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  fiscalDocumentId: string,
  at: Date,
): Promise<void> {
  return resolveOpenAlertOf(tx, fiscalUnknownAlertKey(fiscalDocumentId), { now: () => at });
}
