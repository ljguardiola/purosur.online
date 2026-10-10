import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { priceReviewPostponements, purchases, suppliers } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { seededPriceListId } from "../../test-support/seeded-price-list.js";

export async function insertPriceReviewPostponement<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  fields: {
    productId: string;
    actorId: string;
    postponedAt: Date;
    priceListId?: string;
    resolvedByReviewId?: string;
  },
): Promise<string> {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: `Distribuidora ${crypto.randomUUID()}`, actorId: fields.actorId })
    .returning({ id: suppliers.id });
  const [purchase] = await db
    .insert(purchases)
    .values({
      supplierId: supplier?.id as string,
      locationId: await seededLocationId(db),
      purchasedOn: "2026-01-05",
      receiptType: "sin_comprobante",
      recordedAt: fields.postponedAt,
      actorId: fields.actorId,
    })
    .returning({ id: purchases.id });
  const [postponement] = await db
    .insert(priceReviewPostponements)
    .values({
      productId: fields.productId,
      priceListId: fields.priceListId ?? (await seededPriceListId(db)),
      postponedAt: fields.postponedAt,
      actorId: fields.actorId,
      purchaseId: purchase?.id as string,
      resolvedByReviewId: fields.resolvedByReviewId ?? null,
    })
    .returning({ id: priceReviewPostponements.id });
  return postponement?.id as string;
}
