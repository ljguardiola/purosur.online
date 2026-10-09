import { recordLoss, registerCount } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  locations,
  products,
  stockBalances,
  stockCounts,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";

const COUNTED_AT = new Date("2026-09-15T21:32:00.000Z");
const BEFORE_COUNT = new Date("2026-09-15T20:00:00.000Z");
const AFTER_COUNT = new Date("2026-09-15T21:35:00.000Z");
const NOW = new Date("2026-09-15T21:40:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function insertProduct(
  overrides: { active?: boolean; saleUnit?: "UNIT" | "KG" } = {},
): Promise<string> {
  const [category] = await db.insert(categories).values({ name: "Frutos secos" }).returning({
    id: categories.id,
  });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({
      name: "Almendras peladas",
      categoryId: category.id,
      saleUnit: overrides.saleUnit ?? "KG",
      active: overrides.active ?? true,
    })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

async function insertUser(locationId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return user.id;
}

async function insertLocation(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  return location.id;
}

async function seedMovement(params: {
  productId: string;
  locationId: string;
  actorId: string;
  kind: "loss" | "count";
  delta: number;
  occurredAt: Date;
  supersededByCountId?: string;
}): Promise<string> {
  const [movement] = await db
    .insert(stockMovements)
    .values({
      ...params,
      reason: params.kind === "loss" ? "spoiled" : null,
      supersededByCountId: params.supersededByCountId ?? null,
    })
    .returning({ id: stockMovements.id });
  if (!movement) {
    throw new Error("test setup: seeding the movement returned no row");
  }
  return movement.id;
}

function portsAt(moment: Date) {
  return { store: new DrizzleStockStore(db), clock: { now: () => moment } };
}

describe("DrizzleStockStore", () => {
  it("answers not_found for a product that doesn't exist, creating no balance for it", async () => {
    const locationId = await seededLocationId(db);
    const store = new DrizzleStockStore(db);

    const locked = await store.transaction((tx) =>
      tx.lockProductStock({ productId: "00000000-0000-4000-8000-000000000000", locationId }),
    );

    expect(locked).toEqual({ kind: "not_found" });
    expect(await db.select().from(stockBalances)).toEqual([]);
  });

  it("locks a deactivated product with the balance it still holds", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct({ active: false, saleUnit: "KG" });
    await db.insert(stockBalances).values({ productId, locationId, quantity: 3000 });
    const store = new DrizzleStockStore(db);

    const locked = await store.transaction((tx) => tx.lockProductStock({ productId, locationId }));

    expect(locked).toEqual({ kind: "locked", saleUnit: "KG", balance: 3000 });
  });

  it("locks a product with no movement yet at a zero balance, with its sale unit", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct({ saleUnit: "UNIT" });
    const store = new DrizzleStockStore(db);

    const locked = await store.transaction((tx) => tx.lockProductStock({ productId, locationId }));

    expect(locked).toEqual({ kind: "locked", saleUnit: "UNIT", balance: 0 });
  });

  it("records a loss and moves the balance of its branch only", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    await db.insert(stockBalances).values([
      { productId, locationId, quantity: 5000 },
      { productId, locationId: otherLocationId, quantity: 9000 },
    ]);

    const outcome = await recordLoss(portsAt(NOW), {
      productId,
      locationId,
      reason: "spoiled",
      quantity: 1200,
      actorId,
    });

    expect(outcome).toMatchObject({ kind: "recorded", balance: 3800, supersededByCountId: null });
    const balances = await db
      .select({ locationId: stockBalances.locationId, quantity: stockBalances.quantity })
      .from(stockBalances);
    expect(balances).toEqual(
      expect.arrayContaining([
        { locationId, quantity: 3800 },
        { locationId: otherLocationId, quantity: 9000 },
      ]),
    );
    const movements = await db.select().from(stockMovements);
    expect(movements).toEqual([
      {
        id: expect.any(String),
        productId,
        locationId,
        kind: "loss",
        reason: "spoiled",
        saleLineId: null,
        delta: -1200,
        occurredAt: NOW,
        recordedAt: expect.any(Date),
        actorId,
        supersededByCountId: null,
      },
    ]);
  });

  it("notes each movement it records as a change of the movement's branch", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    await db.insert(stockBalances).values({ productId, locationId, quantity: 5000 });
    const before = await lastLoggedChangeSeq(db);

    await recordLoss(portsAt(NOW), {
      productId,
      locationId,
      reason: "spoiled",
      quantity: 1200,
      actorId,
    });
    await registerCount(portsAt(NOW), {
      productId,
      locationId,
      counted: 3000,
      occurredAt: AFTER_COUNT,
      actorId,
    });

    const [loss, count] = await db
      .select({ id: stockMovements.id, kind: stockMovements.kind })
      .from(stockMovements)
      .orderBy(stockMovements.recordedAt);
    expect([loss?.kind, count?.kind]).toEqual(["loss", "count"]);
    expect(await changesLoggedAfter(db, before)).toEqual([
      { entity: "stock_movement", entityId: loss?.id, version: 1, op: "insert", locationId },
      { entity: "stock_movement", entityId: count?.id, version: 1, op: "insert", locationId },
    ]);
  });

  it("registers a count against the balance left after undoing later applied movements of its branch", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    await db.insert(stockBalances).values({ productId, locationId, quantity: 11_400 });
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -600,
      occurredAt: BEFORE_COUNT,
    });
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -1000,
      occurredAt: AFTER_COUNT,
    });
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -400,
      occurredAt: COUNTED_AT,
    });
    await seedMovement({
      productId,
      locationId: otherLocationId,
      actorId,
      kind: "loss",
      delta: -300,
      occurredAt: AFTER_COUNT,
    });
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -5000,
      occurredAt: AFTER_COUNT,
      supersededByCountId: await seedMovement({
        productId,
        locationId: otherLocationId,
        actorId,
        kind: "count",
        delta: 0,
        occurredAt: NOW,
      }),
    });

    const outcome = await registerCount(portsAt(NOW), {
      productId,
      locationId,
      counted: 12_150,
      occurredAt: COUNTED_AT,
      actorId,
    });

    expect(outcome).toMatchObject({
      kind: "recorded",
      expected: 12_400,
      delta: -250,
      balance: 11_150,
      supersededByCountId: null,
    });
    if (outcome.kind !== "recorded") {
      throw new Error("the count was not recorded");
    }
    const [count] = await db
      .select()
      .from(stockCounts)
      .where(eq(stockCounts.movementId, outcome.movementId));
    expect(count).toEqual({ movementId: outcome.movementId, counted: 12_150, expected: 12_400 });
  });

  it("marks a movement dated at or before a count of its branch as superseded by the earliest such count", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    await db.insert(stockBalances).values({ productId, locationId, quantity: 7000 });
    await seedMovement({
      productId,
      locationId: otherLocationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: BEFORE_COUNT,
    });
    const earliest = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: NOW,
    });
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: new Date(NOW.getTime() + 60_000),
    });
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -1,
      occurredAt: new Date(NOW.getTime() + 30_000),
    });

    const outcome = await recordLoss(portsAt(NOW), {
      productId,
      locationId,
      reason: "theft",
      quantity: 1000,
      actorId,
    });

    expect(outcome).toMatchObject({ balance: 7000, supersededByCountId: earliest });
    const [balance] = await db.select({ quantity: stockBalances.quantity }).from(stockBalances);
    expect(balance).toEqual({ quantity: 7000 });
  });

  it("refuses a count at the moment of another count of the product in the branch", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: COUNTED_AT,
    });

    const outcome = await registerCount(portsAt(NOW), {
      productId,
      locationId,
      counted: 1000,
      occurredAt: COUNTED_AT,
      actorId,
    });

    expect(outcome).toEqual({ kind: "count_at_same_moment" });
  });
});
