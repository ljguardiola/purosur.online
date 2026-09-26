import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { priceLists } from "../db/schema.js";

/**
 * Looks up the single price list the migrations seed ("Lista general"). The business runs one
 * price list today, and every branch's settings already point at it, so a test that seeds a price
 * needs this id for its `price_list_id`, the same way `seededLocationId` gives one for
 * `location_id`.
 */
export async function seededPriceListId<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [priceList] = await db.select({ id: priceLists.id }).from(priceLists).limit(1);
  if (!priceList) {
    throw new Error("test setup: no price list seeded");
  }
  return priceList.id;
}
