import type { PurchaseOrderState } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { purchaseOrderLines, purchaseOrders } from "../../platform/db/schema.js";

export interface OrderRowInput {
  supplierId: string;
  locationId: string;
  actorId: string;
  productId: string;
  state: PurchaseOrderState;
  sentAt?: Date;
  lines?: readonly { packages: number; expectedPackagePriceCents: number | null }[];
}

export async function insertOrderRow<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: OrderRowInput,
): Promise<string> {
  const sent = input.state !== "DRAFT" && input.state !== "CANCELLED";
  const sentAt = sent ? (input.sentAt ?? new Date("2026-10-02T13:00:00.000Z")) : null;
  const [order] = await db
    .insert(purchaseOrders)
    .values({
      supplierId: input.supplierId,
      locationId: input.locationId,
      state: input.state,
      createdAt: new Date("2026-10-01T13:00:00.000Z"),
      actorId: input.actorId,
      sentAt,
      sentBy: sent ? input.actorId : null,
      receivedAt: input.state === "RECEIVED" ? new Date("2026-10-03T13:00:00.000Z") : null,
      cancelledAt: input.state === "CANCELLED" ? new Date("2026-10-01T14:00:00.000Z") : null,
      cancelledBy: input.state === "CANCELLED" ? input.actorId : null,
    })
    .returning({ id: purchaseOrders.id });
  if (!order) {
    throw new Error("test setup: inserting the order returned no row");
  }
  const lines = input.lines ?? [{ packages: 1, expectedPackagePriceCents: 1_000 }];
  await db.insert(purchaseOrderLines).values(
    lines.map((line, index) => ({
      purchaseOrderId: order.id,
      position: index + 1,
      productId: input.productId,
      packages: line.packages,
      quantityPerPackage: 1_000,
      expectedPackagePriceCents: line.expectedPackagePriceCents,
    })),
  );
  return order.id;
}
