import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { buyerIdentificationThresholds, changes } from "../platform/db/schema.js";

const THRESHOLD_ENTITY = "buyer_identification_threshold";

export async function removeSeededThreshold<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<void> {
  await db.delete(changes).where(eq(changes.entity, THRESHOLD_ENTITY));
  await db.delete(buyerIdentificationThresholds);
}
