import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../platform/db/schema.js";

export async function branchPriceListId<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<string> {
  const [row] = await db
    .select({ priceListId: branchSettings.priceListId })
    .from(branchSettings)
    .where(eq(branchSettings.locationId, locationId));
  if (!row) {
    throw new Error(`branch settings missing for location ${locationId}`);
  }
  return row.priceListId;
}
