import { randomUUID } from "node:crypto";
import { createProduct } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, products } from "../platform/db/schema.js";
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
        saleUnit: "UNIT",
        barcodes: [code],
        netContent: null,
      }),
      createProduct(new DrizzleCatalogStore(db), {
        name: "Maceta B",
        categoryId: category.id,
        saleUnit: "UNIT",
        barcodes: [code],
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
