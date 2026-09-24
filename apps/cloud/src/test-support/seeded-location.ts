import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations } from "../db/schema.js";

/**
 * Looks up the single location the migrations seed. The business runs one branch today, so every
 * test that inserts a user needs this id for its now-required `location_id`; this helper exists so
 * the many call sites don't each duplicate the lookup.
 */
export async function seededLocationId<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [location] = await db.select({ id: locations.id }).from(locations).limit(1);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  return location.id;
}
