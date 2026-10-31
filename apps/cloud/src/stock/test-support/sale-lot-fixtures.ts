import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lotAllocations, stockMovements } from "../../platform/db/schema.js";

export async function insertSaleMovement<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    productId: string;
    locationId: string;
    actorId: string;
    saleLineId: string;
    allocations: readonly { lotId: string; quantity: number }[];
    occurredAt?: Date;
  },
): Promise<void> {
  const delta = input.allocations.reduce((sum, { quantity }) => sum + quantity, 0);
  const [movement] = await db
    .insert(stockMovements)
    .values({
      productId: input.productId,
      locationId: input.locationId,
      actorId: input.actorId,
      kind: "sale",
      saleLineId: input.saleLineId,
      delta,
      occurredAt: input.occurredAt ?? new Date("2026-10-01T14:00:00.000Z"),
    })
    .returning({ id: stockMovements.id });
  if (!movement) {
    throw new Error("test setup: seeding the sale movement returned no row");
  }
  await db
    .insert(lotAllocations)
    .values(input.allocations.map((allocation) => ({ movementId: movement.id, ...allocation })));
}
