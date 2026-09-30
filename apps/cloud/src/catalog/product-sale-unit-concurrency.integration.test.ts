import { randomUUID } from "node:crypto";
import { createCategory, createProduct, editProduct } from "@purosur/domain/catalog/use-cases";
import { createDiscount } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discounts, products } from "../platform/db/schema.js";
import { DrizzleDiscountStore } from "../pricing/drizzle-discount-store.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding the product's row lock until both queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("product_sale_unit_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const clock = { now: () => new Date("2026-10-15T15:00:00Z") };

async function unitProduct() {
  const store = new DrizzleCatalogStore(db);
  const category = await createCategory(store, { name: `Almacén ${randomUUID()}`, parentId: null });
  if (category.kind !== "created") {
    throw new Error("test setup: expected the category to be created");
  }
  const created = await createProduct(store, {
    name: "Galletitas",
    categoryId: category.category.id,
    brandId: null,
    saleUnit: "UNIT",
    barcodes: [randomUUID()],
    tagIds: [],
    netContent: null,
  });
  if (created.kind !== "created") {
    throw new Error("test setup: expected the product to be created");
  }
  return { categoryId: category.category.id, product: created.product };
}

function holdProductRowLock(id: string) {
  return (connection: postgres.ReservedSql) =>
    connection`select id from products where id = ${id} for update`;
}

function editToWeight(
  product: { id: string; name: string; version: number; barcodes: string[] },
  categoryId: string,
) {
  return () =>
    editProduct(
      { store: new DrizzleCatalogStore(db), clock },
      {
        id: product.id,
        name: product.name,
        categoryId,
        brandId: null,
        saleUnit: "KG",
        barcodes: product.barcodes,
        netContent: null,
        tagIds: [],
        version: product.version,
      },
    );
}

function buyNPayMDiscountOn(productId: string) {
  return () =>
    createDiscount(
      { store: new DrizzleDiscountStore(db) },
      {
        name: "3x2 Galletitas",
        benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
        target: { kind: "PRODUCT", id: productId },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [],
      },
    );
}

async function storedSaleUnit(productId: string) {
  const [row] = await db
    .select({ saleUnit: products.saleUnit })
    .from(products)
    .where(eq(products.id, productId));
  return row?.saleUnit;
}

describe("selling a product by weight while a buy-n-pay-m discount is created on it, on a real Postgres", () => {
  it("refuses the discount when the edit commits first", async () => {
    const { categoryId, product } = await unitProduct();

    const [edit, creation] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      editToWeight(product, categoryId),
      buyNPayMDiscountOn(product.id),
    );

    expect(edit.kind).toBe("applied");
    expect(creation.kind).toBe("target_not_sold_by_unit");
    expect(await storedSaleUnit(product.id)).toBe("KG");
    expect(await db.select().from(discounts).where(eq(discounts.productId, product.id))).toEqual(
      [],
    );
  });

  it("refuses the edit when the discount commits first", async () => {
    const { categoryId, product } = await unitProduct();

    const [creation, edit] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      buyNPayMDiscountOn(product.id),
      editToWeight(product, categoryId),
    );

    expect(creation.kind).toBe("created");
    expect(edit).toEqual({ kind: "sale_unit_held_by_discount", discountName: "3x2 Galletitas" });
    expect(await storedSaleUnit(product.id)).toBe("UNIT");
    expect(
      await db.select().from(discounts).where(eq(discounts.productId, product.id)),
    ).toHaveLength(1);
  });
});
