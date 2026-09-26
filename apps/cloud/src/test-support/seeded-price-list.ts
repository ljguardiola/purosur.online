import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { priceLists } from "../db/schema.js";

// The business runs one price list today ("Lista general"); every branch points at it.
export async function seededPriceListId<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [priceList] = await db.select({ id: priceLists.id }).from(priceLists).limit(1);
  if (!priceList) {
    throw new Error("test setup: no price list seeded");
  }
  return priceList.id;
}
