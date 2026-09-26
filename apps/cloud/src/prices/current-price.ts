import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { priceReviews, prices } from "../db/schema.js";

/** The one ordering every route uses to decide which of a product's prices is the current one. */
export const NEWEST_PRICE_FIRST = [desc(prices.validFrom), desc(prices.id)] as const;

export async function latestReviewedAt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productId: string,
  priceListId: string,
): Promise<Date | undefined> {
  const [latest] = await db
    .select({ reviewedAt: priceReviews.reviewedAt })
    .from(priceReviews)
    .where(and(eq(priceReviews.productId, productId), eq(priceReviews.priceListId, priceListId)))
    .orderBy(desc(priceReviews.reviewedAt))
    .limit(1);
  return latest?.reviewedAt;
}

/**
 * `now`, unless an already committed moment is at or after it: then one millisecond after the
 * latest of those. Callers' clocks can disagree, so this keeps a later commit recorded as later.
 */
export function momentAfter(now: Date, committed: (Date | undefined)[]): Date {
  let moment = now.getTime();
  for (const date of committed) {
    if (date && date.getTime() >= moment) {
      moment = date.getTime() + 1;
    }
  }
  return new Date(moment);
}
