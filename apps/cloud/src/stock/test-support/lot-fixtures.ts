import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  lots,
  purchaseLines,
  purchases,
  stockMovements,
  suppliers,
} from "../../platform/db/schema.js";

export async function insertPurchasedLot<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    productId: string;
    locationId: string;
    actorId: string;
    purchasedOn?: string;
    supplierName?: string;
    expiresOn?: string | null;
    lotNumber?: string | null;
    remaining?: number;
    createdAt?: Date;
  },
): Promise<string> {
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
  const purchasedOn = input.purchasedOn ?? "2026-10-01";
  const [purchase] = await db
    .insert(purchases)
    .values({
      supplierId: supplier.id,
      locationId: input.locationId,
      purchasedOn,
      receiptType: "sin_comprobante",
      recordedAt: new Date(`${purchasedOn}T12:00:00.000Z`),
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
      quantity: 10_000,
      costPaidCents: 5_000,
      quantityPerPackage: 1_000,
    })
    .returning({ id: purchaseLines.id });
  if (!line) {
    throw new Error("test setup: seeding the purchase line returned no row");
  }
  const [lot] = await db
    .insert(lots)
    .values({
      productId: input.productId,
      locationId: input.locationId,
      purchaseLineId: line.id,
      purchasedOn,
      expiresOn: input.expiresOn ?? null,
      lotNumber: input.lotNumber ?? null,
      costTotalCents: 5_000,
      costQuantity: 1_000,
      quantityReceived: 10_000,
      remaining: input.remaining ?? 10_000,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning({ id: lots.id });
  if (!lot) {
    throw new Error("test setup: seeding the lot returned no row");
  }
  return lot.id;
}

export async function insertTechnicalLot<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { productId: string; locationId: string; remaining: number },
): Promise<string> {
  const [lot] = await db
    .insert(lots)
    .values({
      productId: input.productId,
      locationId: input.locationId,
      technical: true,
      costIncomplete: true,
      quantityReceived: 0,
      remaining: input.remaining,
    })
    .returning({ id: lots.id });
  if (!lot) {
    throw new Error("test setup: seeding the technical lot returned no row");
  }
  return lot.id;
}

export async function insertInitialCountLot<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    productId: string;
    locationId: string;
    actorId: string;
    counted?: number;
    remaining?: number;
    expiresOn?: string | null;
    withdrawn?: boolean;
    unitCostCents?: number;
  },
): Promise<{ lotId: string; movementId: string }> {
  const counted = input.counted ?? 6_000;
  const [movement] = await db
    .insert(stockMovements)
    .values({
      productId: input.productId,
      locationId: input.locationId,
      kind: "opening_count",
      reason: null,
      delta: counted,
      occurredAt: new Date("2026-10-01T12:00:00.000Z"),
      actorId: input.actorId,
    })
    .returning({ id: stockMovements.id });
  if (!movement) {
    throw new Error("test setup: seeding the opening count movement returned no row");
  }
  const [lot] = await db
    .insert(lots)
    .values({
      productId: input.productId,
      locationId: input.locationId,
      originMovementId: movement.id,
      expiresOn: input.expiresOn ?? null,
      withdrawn: input.withdrawn ?? false,
      costIncomplete: input.unitCostCents === undefined,
      costTotalCents: input.unitCostCents ?? null,
      costQuantity: input.unitCostCents === undefined ? null : 1_000,
      quantityReceived: counted,
      remaining: input.remaining ?? counted,
    })
    .returning({ id: lots.id });
  if (!lot) {
    throw new Error("test setup: seeding the initial count lot returned no row");
  }
  return { lotId: lot.id, movementId: movement.id };
}
