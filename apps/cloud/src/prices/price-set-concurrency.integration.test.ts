import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, priceReviews, prices, products, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { confirmPrice } from "./price-confirmation-route.js";
import { setPrice } from "./price-set-route.js";

// PGlite serves every query on one connection and serializes transactions outright, so two price
// writes on the same product can only interleave on a real Postgres pool. Each test pins the
// interleaving by holding the product's row lock on a connection of its own and waiting until
// both writes queue behind it, so the order in which they reach the database is decided by the
// test, not by timing.
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
  return { actorId: actor.id, productId: product.id };
}

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test setup: ${count} writes never queued behind the held lock`);
}

/**
 * Holds `FOR UPDATE` on the product row, starts `first`, starts `second` only once `first` is
 * waiting on that same lock, then lets both go once `second` waits too.
 */
async function runQueuedBehindProductLock<TFirst, TSecond>(
  productId: string,
  first: () => Promise<TFirst>,
  second: () => Promise<TSecond>,
): Promise<[TFirst, TSecond]> {
  const reserved = await sql.reserve();
  let firstOutcome: Promise<TFirst> | undefined;
  let secondOutcome: Promise<TSecond> | undefined;
  try {
    await reserved`begin`;
    await reserved`select id from products where id = ${productId} for update`;
    firstOutcome = first();
    await waitForLockWaiters(1);
    secondOutcome = second();
    await waitForLockWaiters(2);
  } finally {
    await reserved`rollback`;
    reserved.release();
    await Promise.allSettled([firstOutcome, secondOutcome]);
  }
  return Promise.all([firstOutcome, secondOutcome]);
}

const NOW = () => new Date("2026-01-05T12:00:00.000Z");

describe("two price changes on the same never-priced product queued behind each other, on a real Postgres", () => {
  it("applies exactly one of them and reports the other as stale_price", async () => {
    const priceListId = await seededPriceListId(db);
    const { actorId, productId } = await seedActorAndProduct();
    const change = (unitPrice: number) => () =>
      setPrice(db, {
        productId,
        priceListId,
        unitPrice,
        expectedCurrentPriceId: null,
        actorId,
        now: NOW,
      });

    const [first, second] = await runQueuedBehindProductLock(productId, change(1000), change(2000));

    const outcomes = [first.kind, second.kind].sort();
    expect(outcomes).toEqual(["applied", "stale_price"]);
    const rows = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(rows).toHaveLength(1);
  });
});

describe("a confirmation queued behind a change of the price it confirms, on a real Postgres", () => {
  it("reports the confirmation as stale_price and records no review of the superseded price", async () => {
    const priceListId = await seededPriceListId(db);
    const { actorId, productId } = await seedActorAndProduct();
    const [superseded] = await db
      .insert(prices)
      .values({ productId, priceListId, unitPrice: 1000, validFrom: NOW() })
      .returning({ id: prices.id });
    if (!superseded) {
      throw new Error("test setup: seeding the price returned no row");
    }

    const [change, confirmation] = await runQueuedBehindProductLock(
      productId,
      () =>
        setPrice(db, {
          productId,
          priceListId,
          unitPrice: 2000,
          expectedCurrentPriceId: superseded.id,
          actorId,
          now: NOW,
        }),
      () =>
        confirmPrice(db, {
          productId,
          priceListId,
          expectedCurrentPriceId: superseded.id,
          actorId,
          now: NOW,
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
