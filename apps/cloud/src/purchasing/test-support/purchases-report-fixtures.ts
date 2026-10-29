import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { purchaseLines, purchases, suppliers } from "../../platform/db/schema.js";

export async function insertSupplier<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { actorId: string; name: string },
): Promise<string> {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: input.name, actorId: input.actorId })
    .returning({ id: suppliers.id });
  if (!supplier) {
    throw new Error("test setup: seeding the supplier returned no row");
  }
  return supplier.id;
}

export async function insertPurchaseOfLines<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    supplierId: string;
    locationId: string;
    actorId: string;
    productId: string;
    purchasedOn: string;
    lines: { costPaidCents: number; quantity: number; quantityPerPackage: number }[];
  },
): Promise<string> {
  const [purchase] = await db
    .insert(purchases)
    .values({
      supplierId: input.supplierId,
      locationId: input.locationId,
      purchasedOn: input.purchasedOn,
      receiptType: "sin_comprobante",
      recordedAt: new Date(`${input.purchasedOn}T15:00:00.000Z`),
      actorId: input.actorId,
    })
    .returning({ id: purchases.id });
  if (!purchase) {
    throw new Error("test setup: seeding the purchase returned no row");
  }
  await db.insert(purchaseLines).values(
    input.lines.map((line, index) => ({
      purchaseId: purchase.id,
      position: index + 1,
      productId: input.productId,
      ...line,
    })),
  );
  return purchase.id;
}
