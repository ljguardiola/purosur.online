import { INSTALLATION_REQUEST_LIMITS } from "@purosur/domain";
import type { LimitedEndpoint } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { installationRequestAttempts } from "../../platform/db/schema.js";

export async function insertAdmittedRequests<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deviceId: string,
  endpoint: LimitedEndpoint,
  attemptedAt: Date,
  count: number,
): Promise<void> {
  await db
    .insert(installationRequestAttempts)
    .values(Array.from({ length: count }, () => ({ deviceId, endpoint, attemptedAt })));
}

export function insertRequestsUpToLimit<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deviceId: string,
  endpoint: LimitedEndpoint,
  attemptedAt: Date,
): Promise<void> {
  return insertAdmittedRequests(
    db,
    deviceId,
    endpoint,
    attemptedAt,
    INSTALLATION_REQUEST_LIMITS[endpoint],
  );
}
