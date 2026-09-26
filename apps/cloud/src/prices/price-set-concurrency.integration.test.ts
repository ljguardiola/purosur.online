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
import { confirmPrice } from "./price-confirmation-route.js";
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

describe("two price changes racing on the same never-priced product, on a real Postgres through postgres-js", () => {
  it("applies exactly one of them and reports the other as stale_price", async () => {
    const priceListId = await seededPriceListId(db);
    const { actorId, productId } = await seedActorAndProduct();
    const now = () => new Date("2026-01-05T12:00:00.000Z");
    const [first, second] = await Promise.all([
      setPrice(db, {
        productId,
        priceListId,
        unitPrice: 1000,
        expectedCurrentPriceId: null,
        actorId,
        now,
      }),
      setPrice(db, {
        productId,
        priceListId,
        unitPrice: 2000,
        expectedCurrentPriceId: null,
        actorId,
        now,
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "stale_price")).toHaveLength(1);

    const rows = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(rows).toHaveLength(1);
  });
});

describe("price changes committed by callers whose clocks disagree", () => {
  it("rejects as stale_price a change from an earlier clock made over a price it never saw", async () => {
    const priceListId = await seededPriceListId(db);
    const { actorId, productId } = await seedActorAndProduct();

    const laterClock = await setPrice(db, {
      productId,
      priceListId,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId,
      now: () => new Date("2026-01-05T12:00:05.000Z"),
    });
    const earlierClock = await setPrice(db, {
      productId,
      priceListId,
      unitPrice: 2000,
      expectedCurrentPriceId: null,
      actorId,
      now: () => new Date("2026-01-05T12:00:00.000Z"),
    });

    expect(laterClock.kind).toBe("applied");
    expect(earlierClock.kind).toBe("stale_price");
    const rows = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(rows).toHaveLength(1);
  });

  it("rejects as stale_price a confirmation from an earlier clock of a price already superseded", async () => {
    const priceListId = await seededPriceListId(db);
    const { actorId, productId } = await seedActorAndProduct();

    const first = await setPrice(db, {
      productId,
      priceListId,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId,
      now: () => new Date("2026-01-05T12:00:00.000Z"),
    });
    if (first.kind !== "applied") {
      throw new Error("test setup: the first price was not applied");
    }
    const second = await setPrice(db, {
      productId,
      priceListId,
      unitPrice: 2000,
      expectedCurrentPriceId: first.price.id,
      actorId,
      now: () => new Date("2026-01-05T12:00:05.000Z"),
    });
    expect(second.kind).toBe("applied");

    const confirmation = await confirmPrice(db, {
      productId,
      priceListId,
      expectedCurrentPriceId: first.price.id,
      actorId,
      now: () => new Date("2026-01-05T12:00:02.000Z"),
    });

    expect(confirmation.kind).toBe("stale_price");
  });
});
