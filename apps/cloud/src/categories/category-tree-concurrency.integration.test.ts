import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, products } from "../db/schema.js";
import { createProduct } from "../products/product-creation-route.js";
import { editProduct } from "../products/product-edit-route.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { createCategory } from "./category-creation-route.js";
import { CATEGORY_MOVE_LOCK_KEY, editCategory } from "./category-edit-route.js";

// PGlite serves every query on one connection and serializes transactions outright, so racing
// writes can only interleave on a real Postgres pool. Each test pins the interleaving by holding a
// lock on a connection of its own and waiting until both writes queue behind it, so the order in
// which they reach the database is decided by the test, not by timing.
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

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test setup: ${count} writes never queued behind the held lock`);
}

/**
 * Takes a lock with `holdLock` on a connection of its own, starts `first`, starts `second` only
 * once `first` is waiting on it, then releases it once `second` waits too.
 */
async function runQueuedBehindHeldLock<First, Second>(
  holdLock: (connection: postgres.ReservedSql) => Promise<unknown>,
  first: () => Promise<First>,
  second: () => Promise<Second>,
): Promise<[First, Second]> {
  const reserved = await sql.reserve();
  let firstOutcome: Promise<First> | undefined;
  let secondOutcome: Promise<Second> | undefined;
  try {
    await reserved`begin`;
    await holdLock(reserved);
    firstOutcome = first();
    await waitForLockWaiters(1);
    secondOutcome = second();
    await waitForLockWaiters(2);
  } finally {
    await reserved`rollback`;
    reserved.release();
    await Promise.allSettled([firstOutcome, secondOutcome]);
  }
  return Promise.all([firstOutcome, secondOutcome]);
}

function holdCategoryRowLock(categoryId: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from categories where id = ${categoryId} for update`;
}

async function insertTopLevelCategory(name: string) {
  const created = await createCategory(db, { name: `${name} ${randomUUID()}`, parentId: null });
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
      (connection) =>
        connection`select pg_advisory_xact_lock(hashtextextended(${CATEGORY_MOVE_LOCK_KEY}, 0))`,
      () => editCategory(db, { id: a.id, name: a.name, parentId: b.id, version: a.version }),
      () => editCategory(db, { id: b.id, name: b.name, parentId: a.id, version: b.version }),
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

// A product write queued first waits behind the held row lock even without its own `FOR UPDATE`
// (its foreign key check takes a key-share lock on the category), so only the write queued second
// proves that its own row lock is what makes it see the other's result. Each pair therefore runs
// in both orders.
const ORDERS = ["product write first", "category write first"] as const;

async function raceOnCategory<ProductOutcome, CategoryOutcome>(
  order: (typeof ORDERS)[number],
  categoryId: string,
  productWrite: () => Promise<ProductOutcome>,
  categoryWrite: () => Promise<CategoryOutcome>,
): Promise<[ProductOutcome, CategoryOutcome]> {
  if (order === "product write first") {
    return runQueuedBehindHeldLock(holdCategoryRowLock(categoryId), productWrite, categoryWrite);
  }
  const [categoryOutcome, productOutcome] = await runQueuedBehindHeldLock(
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
          createProduct(db, {
            name: "Yerba mate",
            categoryId: almacen.id,
            saleUnit: "UNIT",
            barcodes: [randomUUID()],
          }),
        () => createCategory(db, { name: `Infusiones ${randomUUID()}`, parentId: almacen.id }),
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
      const seeded = await createProduct(db, {
        name: "Yerba mate",
        categoryId: bebidas.id,
        saleUnit: "UNIT",
        barcodes: [randomUUID()],
      });
      if (seeded.kind !== "created") {
        throw new Error("test setup: expected the product to be created");
      }
      const product = seeded.product;

      const [productEdit, categoryMove] = await raceOnCategory(
        order,
        almacen.id,
        () =>
          editProduct(db, {
            id: product.id,
            name: product.name,
            categoryId: almacen.id,
            saleUnit: product.saleUnit,
            barcodes: product.barcodes,
            netContent: null,
            version: product.version,
          }),
        () =>
          editCategory(db, {
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
