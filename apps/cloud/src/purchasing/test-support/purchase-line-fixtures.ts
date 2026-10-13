import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { purchaseLines, purchases, suppliers } from "../../platform/db/schema.js";

export async function insertPurchaseLine<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    productId: string;
    locationId: string;
    actorId: string;
    purchasedOn: string;
    recordedAt: Date;
    costPaidCents: number;
    quantityPerPackage: number;
  },
): Promise<string> {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: `Distribuidora Sur ${crypto.randomUUID()}`, actorId: input.actorId })
    .returning({ id: suppliers.id });
  if (!supplier) {
    throw new Error("test setup: seeding the supplier returned no row");
  }
  const [purchase] = await db
    .insert(purchases)
    .values({
      supplierId: supplier.id,
      locationId: input.locationId,
      purchasedOn: input.purchasedOn,
      receiptType: "sin_comprobante",
      recordedAt: input.recordedAt,
      actorId: input.actorId,
    })
    .returning({ id: purchases.id });
  if (!purchase) {
    throw new Error("test setup: seeding the purchase returned no row");
  }
  const [line] = await db
    .insert(purchaseLines)
    .values({
      purchaseId: purchase.id,
      position: 1,
      productId: input.productId,
      quantity: input.quantityPerPackage,
      costPaidCents: input.costPaidCents,
      quantityPerPackage: input.quantityPerPackage,
    })
    .returning({ id: purchaseLines.id });
  if (!line) {
    throw new Error("test setup: seeding the purchase line returned no row");
  }
  return line.id;
}
