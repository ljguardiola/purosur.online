import { randomUUID } from "node:crypto";
import { recordLoss, registerCount } from "@purosur/domain/stock/use-cases";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  categories,
  products,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";

// PGlite serializes all transactions on one connection, so only a real Postgres pool can interleave
// two movements of the same product; the ordered tests hold the balance row's lock and queue both.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("stock_ledger");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const START_BALANCE = 10_000;
const COUNTED_AT = new Date("2026-09-15T21:32:00.000Z");
const BEFORE_COUNT = new Date("2026-09-15T20:00:00.000Z");
const NOW = new Date("2026-09-15T21:40:00.000Z");

async function seedStockedProduct(): Promise<{
  actorId: string;
  productId: string;
  locationId: string;
}> {
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
    .values({ name: "Miel pura de abeja 1 kg", categoryId: category.id, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  await db
    .insert(stockBalances)
    .values({ productId: product.id, locationId, quantity: START_BALANCE });
  return { actorId: actor.id, productId: product.id, locationId };
}

async function balanceOf(productId: string, locationId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ quantity: stockBalances.quantity })
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, productId), eq(stockBalances.locationId, locationId)));
  return row?.quantity;
}

function holdBalanceRowLock(productId: string, locationId: string) {
  return (holder: postgres.ReservedSql) =>
    holder`select quantity from stock_balances
      where product_id = ${productId} and location_id = ${locationId} for update`;
}

function portsAt(moment: Date) {
  return { store: new DrizzleStockStore(db), clock: { now: () => moment } };
}

describe("stock movements of one product committed at the same time, on a real Postgres", () => {
  it("each reach the balance, none overwriting another", async () => {
    const { actorId, productId, locationId } = await seedStockedProduct();

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        recordLoss(portsAt(NOW), {
          productId,
          locationId,
          reason: "theft",
          quantity: 1000,
          actorId,
        }),
      ),
    );

    expect(outcomes.every((outcome) => outcome.kind === "recorded")).toBe(true);
    expect(await balanceOf(productId, locationId)).toBe(START_BALANCE - 12_000);
    const movements = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    expect(movements).toHaveLength(12);
  });
});

describe("a count and a loss dated before it, queued behind each other on a real Postgres", () => {
  function count(ids: { actorId: string; productId: string; locationId: string }) {
    return () =>
      registerCount(portsAt(NOW), {
        productId: ids.productId,
        locationId: ids.locationId,
        counted: 7000,
        occurredAt: COUNTED_AT,
        actorId: ids.actorId,
      });
  }

  function lateLoss(ids: { actorId: string; productId: string; locationId: string }) {
    return () =>
      recordLoss(portsAt(BEFORE_COUNT), {
        productId: ids.productId,
        locationId: ids.locationId,
        reason: "spoiled",
        quantity: 2000,
        actorId: ids.actorId,
      });
  }

  it("keeps the loss arriving after the count as superseded, leaving the counted balance", async () => {
    const ids = await seedStockedProduct();

    const [counted, lost] = await runQueuedBehindHeldLock(
      sql,
      holdBalanceRowLock(ids.productId, ids.locationId),
      count(ids),
      lateLoss(ids),
    );

    expect(counted).toMatchObject({ kind: "recorded", balance: 7000 });
    expect(lost).toMatchObject({
      kind: "recorded",
      balance: 7000,
      supersededByCountId: counted.kind === "recorded" ? counted.movementId : "no count",
    });
    expect(await balanceOf(ids.productId, ids.locationId)).toBe(7000);
  });

  it("reaches the same balance when the loss arrives first", async () => {
    const ids = await seedStockedProduct();

    const [lost, counted] = await runQueuedBehindHeldLock(
      sql,
      holdBalanceRowLock(ids.productId, ids.locationId),
      lateLoss(ids),
      count(ids),
    );

    expect(lost).toMatchObject({ kind: "recorded", balance: 8000, supersededByCountId: null });
    expect(counted).toMatchObject({ kind: "recorded", expected: 8000, delta: -1000 });
    expect(await balanceOf(ids.productId, ids.locationId)).toBe(7000);
  });
});
