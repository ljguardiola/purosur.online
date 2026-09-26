import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, products } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";

// Application code (`product-validation.ts`) already keeps every one of these three bad shapes
// from ever reaching an insert or update, so these checks are the database's own backstop for
// them and are exercised here by writing straight to the table, bypassing that application code.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let categoryId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("product_net_content_constraints");
  sql = postgres(integrationDb.databaseUrl, { max: 1 });
  db = drizzle(sql);
  const [category] = await db
    .insert(categories)
    .values({ name: `Macetas ${randomUUID()}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  categoryId = category.id;
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function constraintViolatedBy(error: unknown, name: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { constraint_name: constraintName } = current as { constraint_name?: unknown };
    if (constraintName === name) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

describe("the products table's net content constraints on a real Postgres", () => {
  it("rejects a quantity set without a unit", async () => {
    await expect(
      db.insert(products).values({
        name: "Alpiste",
        categoryId,
        saleUnit: "KG",
        netContentQuantity: 1.5,
        netContentUnit: null,
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_net_content_both_or_neither_check"),
    );
  });

  it("rejects a unit set without a quantity", async () => {
    await expect(
      db.insert(products).values({
        name: "Alpiste",
        categoryId,
        saleUnit: "KG",
        netContentQuantity: null,
        netContentUnit: "KG",
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_net_content_both_or_neither_check"),
    );
  });

  it("rejects a non-positive quantity", async () => {
    await expect(
      db.insert(products).values({
        name: "Alpiste",
        categoryId,
        saleUnit: "KG",
        netContentQuantity: 0,
        netContentUnit: "KG",
      }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_net_content_quantity_positive_check"),
    );
  });

  it("rejects an unknown unit", async () => {
    await expect(
      db.insert(products).values({
        name: "Alpiste",
        categoryId,
        saleUnit: "KG",
        netContentQuantity: 1.5,
        netContentUnit: "LB",
      }),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, "products_net_content_unit_check"));
  });
});
