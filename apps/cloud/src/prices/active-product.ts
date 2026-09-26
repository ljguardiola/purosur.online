import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products } from "../db/schema.js";
import { UUID_PATTERN } from "./price-validation.js";

/**
 * Looks up one product that can still be priced, answering `undefined` for a malformed, missing,
 * or deactivated one alike.
 */
export async function findActiveProductById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, id), eq(products.active, true)));
  return product;
}
