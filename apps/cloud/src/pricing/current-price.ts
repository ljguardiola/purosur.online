import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { priceReviews, prices } from "../platform/db/schema.js";

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

// Callers' clocks can disagree, so this keeps a later commit recorded as later than an earlier one.
export function momentAfter(now: Date, committed: (Date | undefined)[]): Date {
  let moment = now.getTime();
  for (const date of committed) {
    if (date && date.getTime() >= moment) {
      moment = date.getTime() + 1;
    }
  }
  return new Date(moment);
}
