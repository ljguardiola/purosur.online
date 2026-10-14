import type { FreightMeans } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  freightPurchases,
  freights,
  purchaseLines,
  purchases,
  suppliers,
} from "../../platform/db/schema.js";

export interface SeededPurchaseLine {
  productId: string;
  costPaidCents: number;
  quantity: number;
  quantityPerPackage: number;
}

export async function insertPurchaseWithLines<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    locationId: string;
    actorId: string;
    lines: SeededPurchaseLine[];
    purchasedOn?: string;
    recordedAt?: Date;
    supplierName?: string;
  },
): Promise<{ purchaseId: string; supplierId: string; lineIds: string[] }> {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      name: input.supplierName ?? `Distribuidora Sur ${crypto.randomUUID()}`,
      actorId: input.actorId,
    })
    .returning({ id: suppliers.id });
  if (!supplier) {
    throw new Error("test setup: seeding the supplier returned no row");
  }
  const [purchase] = await db
    .insert(purchases)
    .values({
      supplierId: supplier.id,
      locationId: input.locationId,
      purchasedOn: input.purchasedOn ?? "2026-03-01",
      receiptType: "sin_comprobante",
      recordedAt: input.recordedAt ?? new Date("2026-03-01T12:00:00.000Z"),
      actorId: input.actorId,
    })
    .returning({ id: purchases.id });
  if (!purchase) {
    throw new Error("test setup: seeding the purchase returned no row");
  }
  const lines = await db
    .insert(purchaseLines)
    .values(
      input.lines.map((line, index) => ({ ...line, purchaseId: purchase.id, position: index + 1 })),
    )
    .returning({ id: purchaseLines.id, position: purchaseLines.position });
  return {
    purchaseId: purchase.id,
    supplierId: supplier.id,
    lineIds: lines.sort((left, right) => left.position - right.position).map(({ id }) => id),
  };
}

export async function insertFreightRow<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    locationId: string;
    actorId: string;
    purchaseIds: string[];
    amountCents?: number;
    date?: string;
    description?: string;
    means?: FreightMeans;
    recordedAt?: Date;
  },
): Promise<string> {
  const means = input.means ?? { kind: "own_trip" };
  const recordedAt = input.recordedAt ?? new Date("2026-03-02T12:00:00.000Z");
  const [freight] = await db
    .insert(freights)
    .values({
      locationId: input.locationId,
      freightOn: input.date ?? "2026-03-02",
      amountCents: input.amountCents ?? 10_000,
      description: input.description ?? "Flete de la semana",
      meansKind: means.kind,
      carrierName: means.kind === "carrier" ? means.name : null,
      recordedAt,
      actorId: input.actorId,
      updatedAt: recordedAt,
    })
    .returning({ id: freights.id });
  if (!freight) {
    throw new Error("test setup: seeding the freight returned no row");
  }
  await db
    .insert(freightPurchases)
    .values(input.purchaseIds.map((purchaseId) => ({ freightId: freight.id, purchaseId })));
  return freight.id;
}
