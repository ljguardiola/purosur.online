import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, products } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { createProduct } from "./product-creation-route.js";

// PGlite runs every query over one connection, so it can never race two creations for the same
// barcode. This runs them over a real postgres-js pool of more than one connection against a real
// Postgres, so the code each one races for is caught either by the transaction's own uniqueness
// check or, when both slip past it concurrently, by the database's unique index on
// `product_barcodes.code` — reported as `constraint_name` by postgres-js, unlike PGlite's
// `constraint`, which is what `isBarcodeUniqueViolation` (in `product-creation-route.ts`) must map
// correctly for this driver too.
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
      createProduct(db, {
        name: "Maceta A",
        categoryId: category.id,
        saleUnit: "UNIT",
        barcodes: [code],
      }),
      createProduct(db, {
        name: "Maceta B",
        categoryId: category.id,
        saleUnit: "UNIT",
        barcodes: [code],
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
