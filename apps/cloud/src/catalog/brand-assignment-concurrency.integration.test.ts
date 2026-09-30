import { randomUUID } from "node:crypto";
import {
  createBrand,
  createCategory,
  createProduct,
  deactivateBrand,
} from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brands, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding the brand's row lock until both queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("brand_assignment_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function brandAndLeafCategory() {
  const store = new DrizzleCatalogStore(db);
  const brand = await createBrand(store, { name: `Granix ${randomUUID()}` });
  const category = await createCategory(store, { name: `Almacén ${randomUUID()}`, parentId: null });
  if (brand.kind !== "created" || category.kind !== "created") {
    throw new Error("test setup: expected the brand and the category to be created");
  }
  return { brandId: brand.brand.id, categoryId: category.category.id };
}

function holdBrandRowLock(brandId: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from brands where id = ${brandId} for update`;
}

function newProductOf(brandId: string, categoryId: string) {
  return () =>
    createProduct(new DrizzleCatalogStore(db), {
      name: "Galletitas",
      categoryId,
      brandId,
      saleUnit: "UNIT",
      barcodes: [randomUUID()],
      tagIds: [],
      netContent: null,
    });
}

describe("creating a product with a brand while the brand is deactivated, on a real Postgres", () => {
  it("refuses the product when the deactivation commits first", async () => {
    const { brandId, categoryId } = await brandAndLeafCategory();

    const [deactivation, creation] = await runQueuedBehindHeldLock(
      sql,
      holdBrandRowLock(brandId),
      () => deactivateBrand(new DrizzleCatalogStore(db), brandId),
      newProductOf(brandId, categoryId),
    );

    expect(deactivation.kind).toBe("deactivated");
    expect(creation.kind).toBe("brand_inactive");
    expect(await db.select().from(products).where(eq(products.brandId, brandId))).toEqual([]);
  });

  it("keeps the brand on a product created before the deactivation commits", async () => {
    const { brandId, categoryId } = await brandAndLeafCategory();

    const [creation, deactivation] = await runQueuedBehindHeldLock(
      sql,
      holdBrandRowLock(brandId),
      newProductOf(brandId, categoryId),
      () => deactivateBrand(new DrizzleCatalogStore(db), brandId),
    );

    expect(creation.kind).toBe("created");
    expect(deactivation.kind).toBe("deactivated");
    expect(await db.select().from(products).where(eq(products.brandId, brandId))).toHaveLength(1);
    expect(await db.select().from(brands).where(eq(brands.id, brandId))).toMatchObject([
      { active: false },
    ]);
  });
});
