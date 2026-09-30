import { randomUUID } from "node:crypto";
import { createCategory, createProduct, editProduct } from "@purosur/domain/catalog/use-cases";
import { editDiscount } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { discounts, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleDiscountStore } from "./drizzle-discount-store.js";

// PGlite serializes every query on one connection, so racing writes can only interleave on a real
// Postgres pool; each test pins that interleaving by holding the product's row lock until both queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("discount_reactivation_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const clock = { now: () => new Date("2026-10-15T15:00:00Z") };

async function unitProductWithSwitchedOffDiscount() {
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
  const [discount] = await db
    .insert(discounts)
    .values({
      name: "3x2 Galletitas",
      kind: "BUY_N_PAY_M",
      buyQty: 3,
      payQty: 2,
      productId: created.product.id,
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      active: false,
    })
    .returning({ id: discounts.id });
  if (!discount) {
    throw new Error("test setup: expected the discount to be stored");
  }
  return { categoryId: category.category.id, product: created.product, discountId: discount.id };
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

function switchOn(discountId: string, productId: string) {
  return () =>
    editDiscount(
      { store: new DrizzleDiscountStore(db), clock },
      {
        id: discountId,
        version: 1,
        name: "3x2 Galletitas",
        benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
        target: { kind: "PRODUCT", id: productId },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [],
        active: true,
      },
    );
}

async function stored(productId: string, discountId: string) {
  const [product] = await db
    .select({ saleUnit: products.saleUnit })
    .from(products)
    .where(eq(products.id, productId));
  const [discount] = await db
    .select({ active: discounts.active })
    .from(discounts)
    .where(eq(discounts.id, discountId));
  return { saleUnit: product?.saleUnit, active: discount?.active };
}

describe("selling a product by weight while its buy-n-pay-m discount is switched back on, on a real Postgres", () => {
  it("refuses switching the discount on when the edit commits first", async () => {
    const { categoryId, product, discountId } = await unitProductWithSwitchedOffDiscount();

    const [edit, switchedOn] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      editToWeight(product, categoryId),
      switchOn(discountId, product.id),
    );

    expect(edit.kind).toBe("applied");
    expect(switchedOn).toEqual({ kind: "product_sold_by_weight", productName: "Galletitas" });
    expect(await stored(product.id, discountId)).toEqual({ saleUnit: "KG", active: false });
  });

  it("refuses the edit when switching the discount on commits first", async () => {
    const { categoryId, product, discountId } = await unitProductWithSwitchedOffDiscount();

    const [switchedOn, edit] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(product.id),
      switchOn(discountId, product.id),
      editToWeight(product, categoryId),
    );

    expect(switchedOn).toEqual({ kind: "applied", version: 2 });
    expect(edit).toEqual({ kind: "sale_unit_held_by_discount", discountName: "3x2 Galletitas" });
    expect(await stored(product.id, discountId)).toEqual({ saleUnit: "UNIT", active: true });
  });
});
