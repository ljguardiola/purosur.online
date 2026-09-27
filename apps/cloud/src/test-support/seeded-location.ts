import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations } from "../db/schema.js";

export async function seededLocationId<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [location] = await db.select({ id: locations.id }).from(locations).limit(1);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  return location.id;
}
