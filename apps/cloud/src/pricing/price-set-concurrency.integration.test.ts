import { randomUUID } from "node:crypto";
import { confirmPrice, setPrice } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, priceReviews, prices, products, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzlePricingStore } from "./drizzle-pricing-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

// PGlite serializes all transactions on one connection, so only a real Postgres pool can
// interleave two writes to the same product; each test holds the row lock and waits for both to queue.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("price_set");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function seedActorAndProduct(): Promise<{ actorId: string; productId: string }> {
  const suffix = randomUUID();
  const locationId = await seededLocationId(db);

  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: `ada-${suffix}@example.com`, locationId })
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
  return { actorId: actor.id, productId: product.id };
}

function holdProductRowLock(productId: string) {
  return (holder: postgres.ReservedSql) =>
    holder`select id from products where id = ${productId} for update`;
}

const NOW = () => new Date("2026-01-05T12:00:00.000Z");

function pricingPorts() {
  return { store: new DrizzlePricingStore(db, () => NOON), clock: { now: NOW } };
}

describe("two price changes on the same never-priced product queued behind each other, on a real Postgres", () => {
  it("applies exactly one of them and reports the other as stale_price", async () => {
    const locationId = await seededLocationId(db);
    const { actorId, productId } = await seedActorAndProduct();
    const change = (unitPrice: number) => () =>
      setPrice(pricingPorts(), {
        productId,
        locationId,
        unitPrice,
        expectedCurrentPriceId: null,
        actorId,
      });

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(productId),
      change(1000),
      change(2000),
    );

    const outcomes = [first.kind, second.kind].sort();
    expect(outcomes).toEqual(["applied", "stale_price"]);
    const rows = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(rows).toHaveLength(1);
  });
});

describe("a confirmation queued behind a change of the price it confirms, on a real Postgres", () => {
  it("reports the confirmation as stale_price and records no review of the superseded price", async () => {
    const priceListId = await seededPriceListId(db);
    const locationId = await seededLocationId(db);
    const { actorId, productId } = await seedActorAndProduct();
    const [superseded] = await db
      .insert(prices)
      .values({ productId, priceListId, unitPrice: 1000, validFrom: NOW() })
      .returning({ id: prices.id });
    if (!superseded) {
      throw new Error("test setup: seeding the price returned no row");
    }

    const [change, confirmation] = await runQueuedBehindHeldLock(
      sql,
      holdProductRowLock(productId),
      () =>
        setPrice(pricingPorts(), {
          productId,
          locationId,
          unitPrice: 2000,
          expectedCurrentPriceId: superseded.id,
          actorId,
        }),
      () =>
        confirmPrice(pricingPorts(), {
          productId,
          locationId,
          expectedCurrentPriceId: superseded.id,
          actorId,
        }),
    );

    expect(change.kind).toBe("applied");
    expect(confirmation.kind).toBe("stale_price");
    const supersededReviews = await db
      .select()
      .from(priceReviews)
      .where(eq(priceReviews.priceId, superseded.id));
    expect(supersededReviews).toEqual([]);
  });
});
