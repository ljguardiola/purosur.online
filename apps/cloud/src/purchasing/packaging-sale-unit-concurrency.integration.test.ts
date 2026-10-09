import { randomUUID } from "node:crypto";
import { editProduct } from "@purosur/domain/catalog/use-cases";
import { createPackaging } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { productBarcodes, productPackagings, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding the product's row lock until both queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let actorId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("packaging_sale_unit_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
  actorId = await insertActor(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const clock = { now: () => new Date("2026-10-15T15:00:00Z") };
const HALF_A_UNIT = 500;
const TWELVE_UNITS = 12_000;

async function unitProduct() {
  const product = await insertProduct(db, { name: "Galletitas" });
  const barcode = randomUUID();
  await db
    .insert(productBarcodes)
    .values({ productId: product.id, code: barcode, position: 0, active: true });
  const [row] = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, product.id));
  return { ...product, barcode, categoryId: row?.categoryId ?? "" };
}

function holdProductRowLock(id: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from products where id = ${id} for update`;
}

function editToWeight(product: {
  id: string;
  version: number;
  categoryId: string;
  barcode: string;
}) {
  return () =>
    editProduct(
      { store: new DrizzleCatalogStore(db), clock },
      {
        id: product.id,
        name: "Galletitas",
        categoryId: product.categoryId,
        brandId: null,
        saleUnit: "KG",
        barcodes: [product.barcode],
        netContent: null,
        tagIds: [],
        version: product.version,
      },
    );
}

function packagingOf(productId: string, quantityPerPackage: number) {
  return () =>
    createPackaging(new DrizzlePurchasingStore(db), {
      productId,
      name: "Caja",
      quantityPerPackage,
      actorId,
    });
}

describe("selling a product by weight while a purchase packaging is defined for it, on a real Postgres", () => {
  it("defines the packaging by the weight when the edit commits first", async () => {
    const product = await unitProduct();

    const [edit, creation] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      editToWeight(product),
      packagingOf(product.id, HALF_A_UNIT),
    );

    expect(edit.kind).toBe("applied");
    expect(creation.kind).toBe("created");
  });

  it("refuses the edit when the packaging commits first", async () => {
    const product = await unitProduct();

    const [creation, edit] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      packagingOf(product.id, TWELVE_UNITS),
      editToWeight(product),
    );

    expect(creation.kind).toBe("created");
    expect(edit).toEqual({ kind: "sale_unit_held_by_packaging", packagingName: "Caja" });
    const [stored] = await db
      .select({ saleUnit: products.saleUnit })
      .from(products)
      .where(eq(products.id, product.id));
    expect(stored?.saleUnit).toBe("UNIT");
    expect(
      await db.select().from(productPackagings).where(eq(productPackagings.productId, product.id)),
    ).toHaveLength(1);
  });
});
