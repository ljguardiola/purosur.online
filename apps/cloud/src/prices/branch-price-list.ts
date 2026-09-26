import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../db/schema.js";

// Every location is seeded with a `branch_settings` row, so a missing one means that invariant
// broke, not a legitimate case a caller should see.
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
