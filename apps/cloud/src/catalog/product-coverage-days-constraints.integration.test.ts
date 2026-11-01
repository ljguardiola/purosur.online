import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, products } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let categoryId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("product_coverage_days_constraints");
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

describe("the products table's coverage days constraint on a real Postgres", () => {
  it.each([1, 15, 365])("accepts %j coverage days", async (coverageDays) => {
    await expect(
      db.insert(products).values({ name: "Alpiste", categoryId, saleUnit: "KG", coverageDays }),
    ).resolves.toBeDefined();
  });

  it.each([0, -1, 366])("rejects %j coverage days", async (coverageDays) => {
    await expect(
      db.insert(products).values({ name: "Alpiste", categoryId, saleUnit: "KG", coverageDays }),
    ).rejects.toSatisfy((error) =>
      constraintViolatedBy(error, "products_coverage_days_range_check"),
    );
  });

  it("gives a product inserted without coverage days 15", async () => {
    const [product] = await db
      .insert(products)
      .values({ name: "Alpiste", categoryId, saleUnit: "KG" })
      .returning({ coverageDays: products.coverageDays });

    expect(product).toEqual({ coverageDays: 15 });
  });
});
