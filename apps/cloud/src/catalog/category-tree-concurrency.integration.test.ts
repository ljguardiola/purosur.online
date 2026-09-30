import { randomUUID } from "node:crypto";
import {
  createCategory,
  createProduct,
  editCategory,
  editProduct,
} from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { CATEGORY_MOVE_LOCK_KEY, DrizzleCatalogStore } from "./drizzle-catalog-store.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding a lock until both writes queue behind it.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("category_tree_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function holdCategoryRowLock(categoryId: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from categories where id = ${categoryId} for update`;
}

async function insertTopLevelCategory(name: string) {
  const created = await createCategory(new DrizzleCatalogStore(db), {
    name: `${name} ${randomUUID()}`,
    parentId: null,
  });
  if (created.kind !== "created") {
    throw new Error("test setup: expected the category to be created");
  }
  return created.category;
}

async function categoryHasBothProductsAndChildren(categoryId: string): Promise<boolean> {
  const assigned = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, categoryId));
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, categoryId));
  return assigned.length > 0 && children.length > 0;
}

describe("moving two unrelated categories under each other concurrently on a real Postgres", () => {
  it("lets exactly one move win and rejects the other as a cycle, creating no cycle", async () => {
    const a = await insertTopLevelCategory("Categoría A");
    const b = await insertTopLevelCategory("Categoría B");

    const [moveAUnderB, moveBUnderA] = await runQueuedBehindHeldLock(
      sql,
      (connection) =>
        connection`select pg_advisory_xact_lock(hashtextextended(${CATEGORY_MOVE_LOCK_KEY}, 0))`,
      () =>
        editCategory(new DrizzleCatalogStore(db), {
          id: a.id,
          name: a.name,
          parentId: b.id,
          version: a.version,
        }),
      () =>
        editCategory(new DrizzleCatalogStore(db), {
          id: b.id,
          name: b.name,
          parentId: a.id,
          version: b.version,
        }),
    );

    const kinds = [moveAUnderB.kind, moveBUnderA.kind].sort();
    expect(kinds).toEqual(["applied", "move_not_allowed"]);
    const [rowA] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, a.id));
    const [rowB] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, b.id));
    expect(rowA?.parentId === b.id && rowB?.parentId === a.id).toBe(false);
  });
});

// A product write queues behind the category's row lock even without its own `FOR UPDATE`, because
// Postgres takes a key-share lock on the referenced row for the foreign key check.
const ORDERS = ["product write first", "category write first"] as const;

async function raceOnCategory<ProductOutcome, CategoryOutcome>(
  order: (typeof ORDERS)[number],
  categoryId: string,
  productWrite: () => Promise<ProductOutcome>,
  categoryWrite: () => Promise<CategoryOutcome>,
): Promise<[ProductOutcome, CategoryOutcome]> {
  if (order === "product write first") {
    return runQueuedBehindHeldLock(
      sql,
      holdCategoryRowLock(categoryId),
      productWrite,
      categoryWrite,
    );
  }
  const [categoryOutcome, productOutcome] = await runQueuedBehindHeldLock(
    sql,
    holdCategoryRowLock(categoryId),
    categoryWrite,
    productWrite,
  );
  return [productOutcome, categoryOutcome];
}

describe("giving a category a product and a subcategory concurrently on a real Postgres", () => {
  it.each(ORDERS)(
    "lets exactly one of a product creation and a subcategory creation win, %s",
    async (order) => {
      const almacen = await insertTopLevelCategory("Almacén");

      const [productCreation, subcategoryCreation] = await raceOnCategory(
        order,
        almacen.id,
        () =>
          createProduct(new DrizzleCatalogStore(db), {
            name: "Yerba mate",
            categoryId: almacen.id,
            brandId: null,
            saleUnit: "UNIT",
            barcodes: [randomUUID()],
            tagIds: [],
            netContent: null,
          }),
        () =>
          createCategory(new DrizzleCatalogStore(db), {
            name: `Infusiones ${randomUUID()}`,
            parentId: almacen.id,
          }),
      );

      const kinds = [productCreation.kind, subcategoryCreation.kind];
      expect(kinds.filter((kind) => kind === "created")).toHaveLength(1);
      expect(kinds).toContainEqual(
        productCreation.kind === "created" ? "parent_has_products" : "category_not_leaf",
      );
      expect(await categoryHasBothProductsAndChildren(almacen.id)).toBe(false);
    },
  );

  it.each(ORDERS)(
    "lets exactly one of a product edit into it and a category move under it win, %s",
    async (order) => {
      const almacen = await insertTopLevelCategory("Almacén");
      const bebidas = await insertTopLevelCategory("Bebidas");
      const infusiones = await insertTopLevelCategory("Infusiones");
      const seeded = await createProduct(new DrizzleCatalogStore(db), {
        name: "Yerba mate",
        categoryId: bebidas.id,
        brandId: null,
        saleUnit: "UNIT",
        barcodes: [randomUUID()],
        tagIds: [],
        netContent: null,
      });
      if (seeded.kind !== "created") {
        throw new Error("test setup: expected the product to be created");
      }
      const product = seeded.product;

      const [productEdit, categoryMove] = await raceOnCategory(
        order,
        almacen.id,
        () =>
          editProduct(new DrizzleCatalogStore(db), {
            id: product.id,
            name: product.name,
            categoryId: almacen.id,
            brandId: null,
            saleUnit: product.saleUnit,
            barcodes: product.barcodes,
            tagIds: [],
            netContent: null,
            version: product.version,
          }),
        () =>
          editCategory(new DrizzleCatalogStore(db), {
            id: infusiones.id,
            name: infusiones.name,
            parentId: almacen.id,
            version: infusiones.version,
          }),
      );

      const kinds = [productEdit.kind, categoryMove.kind];
      expect(kinds.filter((kind) => kind === "applied")).toHaveLength(1);
      expect(kinds).toContainEqual(
        productEdit.kind === "applied" ? "parent_has_products" : "category_not_leaf",
      );
      expect(await categoryHasBothProductsAndChildren(almacen.id)).toBe(false);
    },
  );
});
