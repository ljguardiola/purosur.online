import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, prices, products, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { setPrice } from "./price-set-route.js";

// PGlite runs every query over one connection, so it can never race two price changes for the
// same product. This runs them over a real postgres-js pool of more than one connection against a
// real Postgres, the same reasoning `branch-settings-edit.integration.test.ts` gives for branch
// settings saves.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("price_set");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two price changes racing on the same never-priced product, on a real Postgres through postgres-js", () => {
  it("applies exactly one of them and reports the other as stale_price", async () => {
    const suffix = randomUUID();
    const locationId = await seededLocationId(db);
    const priceListId = await seededPriceListId(db);

    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email: `ada-${suffix}@example.com`, locationId })
      .returning({ id: users.id });
    const [category] = await db
      .insert(categories)
      .values({ name: `Almacén ${suffix}` })
      .returning({ id: categories.id });
    if (!actor || !category) {
      throw new Error("test setup: seeding the actor or category returned no row");
    }
    const [product] = await db
      .insert(products)
      .values({ name: "Arroz", categoryId: category.id, saleUnit: "UNIT" })
      .returning({ id: products.id });
    if (!product) {
      throw new Error("test setup: seeding the product returned no row");
    }

    const now = new Date("2026-01-05T12:00:00.000Z");
    const [first, second] = await Promise.all([
      setPrice(db, {
        productId: product.id,
        priceListId,
        unitPrice: 1000,
        expectedCurrentPriceId: null,
        actorId: actor.id,
        now,
      }),
      setPrice(db, {
        productId: product.id,
        priceListId,
        unitPrice: 2000,
        expectedCurrentPriceId: null,
        actorId: actor.id,
        now,
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "stale_price")).toHaveLength(1);

    const rows = await db.select().from(prices).where(eq(prices.productId, product.id));
    expect(rows).toHaveLength(1);
  });
});
