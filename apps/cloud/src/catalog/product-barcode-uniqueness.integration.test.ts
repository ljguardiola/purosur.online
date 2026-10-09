import { randomUUID } from "node:crypto";
import {
  createProduct,
  deactivateProduct,
  editProduct,
  reactivateProduct,
} from "@purosur/domain/catalog/use-cases";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, productBarcodes, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

// PGlite runs every query over one connection, so it can never race two creations for the same
// barcode; this runs that race over a real postgres-js pool against real Postgres.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("product_barcode_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two products with the same barcode concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as barcode_taken", async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: `Macetas ${randomUUID()}` })
      .returning({ id: categories.id });
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    const code = randomUUID();

    const [first, second] = await Promise.all([
      createProduct(new DrizzleCatalogStore(db), {
        name: "Maceta A",
        categoryId: category.id,
        brandId: null,
        saleUnit: "UNIT",
        barcodes: [code],
        tagIds: [],
        netContent: null,
      }),
      createProduct(new DrizzleCatalogStore(db), {
        name: "Maceta B",
        categoryId: category.id,
        brandId: null,
        saleUnit: "UNIT",
        barcodes: [code],
        tagIds: [],
        netContent: null,
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "barcode_taken")).toHaveLength(1);

    const winner = outcomes.find((outcome) => outcome.kind === "created");
    if (winner?.kind !== "created") {
      throw new Error("test setup: expected one creation to have won the race");
    }
    const matchingProducts = await db
      .select()
      .from(products)
      .where(eq(products.id, winner.product.id));
    expect(matchingProducts).toHaveLength(1);
  });
});

describe("reactivating a product while another takes its barcode on a real Postgres through postgres-js", () => {
  async function seedCategory(): Promise<string> {
    const [category] = await db
      .insert(categories)
      .values({ name: `Macetas ${randomUUID()}` })
      .returning({ id: categories.id });
    if (!category) {
      throw new Error("test setup: seeding the category returned no row");
    }
    return category.id;
  }

  async function newProduct(categoryId: string, name: string, code: string) {
    const created = await createProduct(new DrizzleCatalogStore(db), {
      name,
      categoryId,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: [code],
      tagIds: [],
      netContent: null,
    });
    if (created.kind !== "created") {
      throw new Error(`test setup: creating the product ended as ${created.kind}`);
    }
    return created.product;
  }

  async function deactivatedProductId(categoryId: string, code: string): Promise<string> {
    const product = await newProduct(categoryId, "Maceta A", code);
    await deactivateProduct(new DrizzleCatalogStore(db), product.id);
    return product.id;
  }

  async function activeHoldersOf(code: string): Promise<number> {
    const rows = await db
      .select({ productId: productBarcodes.productId })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.code, code), eq(productBarcodes.active, true)));
    return rows.length;
  }

  it("lets either the reactivation or a creation take the barcode, and reports the other as barcode_taken", async () => {
    const categoryId = await seedCategory();
    const code = randomUUID();
    const reactivatedId = await deactivatedProductId(categoryId, code);

    const [reactivation, creation] = await Promise.all([
      reactivateProduct(new DrizzleCatalogStore(db), reactivatedId),
      createProduct(new DrizzleCatalogStore(db), {
        name: "Maceta B",
        categoryId,
        brandId: null,
        saleUnit: "UNIT",
        barcodes: [code],
        tagIds: [],
        netContent: null,
      }),
    ]);

    const outcomes = [reactivation.kind, creation.kind].sort();
    expect(outcomes).toEqual(
      reactivation.kind === "reactivated"
        ? ["barcode_taken", "reactivated"]
        : ["barcode_taken", "created"],
    );
    expect(await activeHoldersOf(code)).toBe(1);
  });

  it("lets either the reactivation or an edit take the barcode, and reports the other as barcode_taken", async () => {
    const categoryId = await seedCategory();
    const code = randomUUID();
    const reactivatedId = await deactivatedProductId(categoryId, code);
    const edited = await newProduct(categoryId, "Maceta C", randomUUID());

    const [reactivation, edit] = await Promise.all([
      reactivateProduct(new DrizzleCatalogStore(db), reactivatedId),
      editProduct(
        { store: new DrizzleCatalogStore(db), clock: { now: () => new Date() } },
        {
          id: edited.id,
          name: "Maceta C",
          categoryId,
          brandId: null,
          saleUnit: "UNIT",
          barcodes: [code],
          tagIds: [],
          netContent: null,
          version: edited.version,
        },
      ),
    ]);

    const outcomes = [reactivation.kind, edit.kind].sort();
    expect(outcomes).toEqual(
      reactivation.kind === "reactivated"
        ? ["barcode_taken", "reactivated"]
        : ["applied", "barcode_taken"],
    );
    expect(await activeHoldersOf(code)).toBe(1);
  });
});
