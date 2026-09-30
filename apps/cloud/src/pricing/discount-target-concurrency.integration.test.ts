import { randomUUID } from "node:crypto";
import {
  createCategory,
  createProduct,
  createTag,
  deactivateProduct,
  deactivateTag,
} from "@purosur/domain/catalog/use-cases";
import { createDiscount } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { discounts, products, tags } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding the target's row lock until both queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("discount_target_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function tagAndProduct() {
  const store = new DrizzleCatalogStore(db);
  const tag = await createTag(store, { name: `Sin TACC ${randomUUID()}` });
  const category = await createCategory(store, { name: `Almacén ${randomUUID()}`, parentId: null });
  if (tag.kind !== "created" || category.kind !== "created") {
    throw new Error("test setup: expected the tag and the category to be created");
  }
  const product = await createProduct(store, {
    name: "Galletitas",
    categoryId: category.category.id,
    brandId: null,
    saleUnit: "UNIT",
    barcodes: [randomUUID()],
    tagIds: [],
    netContent: null,
  });
  if (product.kind !== "created") {
    throw new Error("test setup: expected the product to be created");
  }
  return { tagId: tag.tag.id, productId: product.product.id };
}

function holdRowLock(table: "tags" | "products", id: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from ${connection(table)} where id = ${id} for update`;
}

function discountAimedAt(target: { kind: "TAG" | "PRODUCT"; id: string }) {
  return () =>
    createDiscount(
      { store: new DrizzleDiscountStore(db) },
      {
        name: "Semana de los frutos secos",
        benefit: { kind: "PERCENT_OFF", percent: 15 },
        target,
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [],
      },
    );
}

async function discountsAimedAt(
  column: typeof discounts.tagId | typeof discounts.productId,
  id: string,
) {
  return db.select().from(discounts).where(eq(column, id));
}

describe("creating a discount aimed at a tag while the tag is deactivated, on a real Postgres", () => {
  it("refuses the discount when the deactivation commits first", async () => {
    const { tagId } = await tagAndProduct();

    const [deactivation, creation] = await runQueuedBehindHeldLock(
      sql,
      holdRowLock("tags", tagId),
      () => deactivateTag(new DrizzleCatalogStore(db), tagId),
      discountAimedAt({ kind: "TAG", id: tagId }),
    );

    expect(deactivation.kind).toBe("deactivated");
    expect(creation.kind).toBe("target_not_found");
    expect(await discountsAimedAt(discounts.tagId, tagId)).toEqual([]);
  });

  it("keeps the discount created before the deactivation commits", async () => {
    const { tagId } = await tagAndProduct();

    const [creation, deactivation] = await runQueuedBehindHeldLock(
      sql,
      holdRowLock("tags", tagId),
      discountAimedAt({ kind: "TAG", id: tagId }),
      () => deactivateTag(new DrizzleCatalogStore(db), tagId),
    );

    expect(creation.kind).toBe("created");
    expect(deactivation.kind).toBe("deactivated");
    expect(await discountsAimedAt(discounts.tagId, tagId)).toHaveLength(1);
    expect(await db.select().from(tags).where(eq(tags.id, tagId))).toMatchObject([
      { active: false },
    ]);
  });
});

describe("creating a discount aimed at a product while the product is deactivated, on a real Postgres", () => {
  it("refuses the discount when the deactivation commits first", async () => {
    const { productId } = await tagAndProduct();

    const [deactivation, creation] = await runQueuedBehindHeldLock(
      sql,
      holdRowLock("products", productId),
      () => deactivateProduct(new DrizzleCatalogStore(db), productId),
      discountAimedAt({ kind: "PRODUCT", id: productId }),
    );

    expect(deactivation.kind).toBe("deactivated");
    expect(creation.kind).toBe("target_not_found");
    expect(await discountsAimedAt(discounts.productId, productId)).toEqual([]);
  });

  it("keeps the discount created before the deactivation commits", async () => {
    const { productId } = await tagAndProduct();

    const [creation, deactivation] = await runQueuedBehindHeldLock(
      sql,
      holdRowLock("products", productId),
      discountAimedAt({ kind: "PRODUCT", id: productId }),
      () => deactivateProduct(new DrizzleCatalogStore(db), productId),
    );

    expect(creation.kind).toBe("created");
    expect(deactivation.kind).toBe("deactivated");
    expect(await discountsAimedAt(discounts.productId, productId)).toHaveLength(1);
    expect(await db.select().from(products).where(eq(products.id, productId))).toMatchObject([
      { active: false },
    ]);
  });
});
