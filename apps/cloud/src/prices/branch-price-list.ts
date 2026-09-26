import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../db/schema.js";

/**
 * The price list `locationId`'s branch works on, from its own settings. Every location gets a
 * `branch_settings` row (and, since migration 0029, that row's `price_list_id`) from the migration
 * that seeds it, so a missing row here means that invariant broke, not a legitimate case a caller
 * should see.
 */
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
