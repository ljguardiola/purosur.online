import type { StockMovementKind } from "@purosur/domain";
import { sql } from "drizzle-orm";
import {
  brands,
  categories,
  products,
  stockMovements,
  users,
  zoneRules,
} from "../../platform/db/schema.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";
import { logChange } from "../change-log.js";

const KINDS_OF_SALE_LINES = ["sale", "sale_void", "return"];
const KINDS_OF_ASSEMBLY_BATCHES = ["assembly_out", "assembly_in", "assembly_void"];
const KINDS_WITH_A_REASON = ["loss", "adjustment"];

export async function insertLoggedBrand(db: TestDatabase["db"], name: string): Promise<string> {
  const [brand] = await db.insert(brands).values({ name }).returning({ id: brands.id });
  const brandId = brand?.id as string;
  await logChange(db, { entity: "brand", entityId: brandId, version: 1, op: "insert" });
  return brandId;
}

export async function insertStockMovementOwners(
  db: TestDatabase["db"],
  locationId: string,
): Promise<{ productId: string; actorId: string }> {
  const [category] = await db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit: "UNIT" })
    .returning({ id: products.id });
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  return { productId: product?.id as string, actorId: actor?.id as string };
}

export async function insertLoggedStockMovement(
  testDatabase: TestDatabase,
  movement: { kind: StockMovementKind; locationId: string; productId: string; actorId: string },
): Promise<string> {
  const { db } = testDatabase;
  const movementId = await testDatabase.asMigrator(async () => {
    const [inserted] = await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      return tx
        .insert(stockMovements)
        .values({
          productId: movement.productId,
          locationId: movement.locationId,
          kind: movement.kind,
          reason: KINDS_WITH_A_REASON.includes(movement.kind) ? "spoiled" : null,
          saleLineId: KINDS_OF_SALE_LINES.includes(movement.kind) ? crypto.randomUUID() : null,
          purchaseLineId: movement.kind === "receipt" ? crypto.randomUUID() : null,
          assemblyBatchId: KINDS_OF_ASSEMBLY_BATCHES.includes(movement.kind)
            ? crypto.randomUUID()
            : null,
          delta: 1000,
          occurredAt: new Date("2026-10-09T15:00:00.000Z"),
          actorId: movement.actorId,
        })
        .returning({ id: stockMovements.id });
    });
    return inserted?.id as string;
  });
  await logChange(db, {
    entity: "stock_movement",
    entityId: movementId,
    version: 1,
    op: "insert",
    locationId: movement.locationId,
  });
  return movementId;
}

export async function insertLoggedZoneRules(db: TestDatabase["db"]): Promise<string> {
  const [rules] = await db
    .insert(zoneRules)
    .values({
      version: "2026a",
      transitions: [{ from: "1900-01-01T00:00:00.000Z", offsetMinutes: -180 }],
      publicationNumber: 9_999,
    })
    .returning({ id: zoneRules.id });
  const zoneRulesId = rules?.id as string;
  await logChange(db, { entity: "zone_rules", entityId: zoneRulesId, version: 1, op: "insert" });
  return zoneRulesId;
}
