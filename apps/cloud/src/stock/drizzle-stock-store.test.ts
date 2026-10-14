import {
  applyOpeningCount,
  discardExpiredLot,
  recordLoss,
  registerCount,
  withdrawOpeningCount,
} from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import type { PgliteQueryResultHKT } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  locations,
  lotAllocations,
  lots,
  products,
  stockBalances,
  stockCountLots,
  stockCounts,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleStockStore } from "./drizzle-stock-store.js";
import { insertInitialCountLot, insertPurchasedLot } from "./test-support/lot-fixtures.js";

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
        purchaseLineId: null,
        delta: -1200,
        occurredAt: NOW,
        recordedAt: expect.any(Date),
        actorId,
        supersededByCountId: null,
        assemblyBatchId: null,
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

describe("DrizzleStockStore lots", () => {
  it("lists the lots of the product in the branch with what the allocation rule reads", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const receivedAt = new Date("2026-10-01T12:00:00.000Z");
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-10-01",
      expiresOn: "2027-03-01",
      remaining: 4000,
      createdAt: receivedAt,
    });
    await insertPurchasedLot(db, { productId, locationId: otherLocationId, actorId });
    const store = new DrizzleStockStore(db);

    const found = await store.transaction((tx) => tx.productLots({ productId, locationId }));

    expect(found).toEqual([
      {
        id: lotId,
        technical: false,
        expiresOn: "2027-03-01",
        purchasedOn: "2026-10-01",
        receivedAt,
        remaining: 4000,
      },
    ]);
  });

  it("opens the product's technical lot with no cost, no expiry and incomplete cost", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const store = new DrizzleStockStore(db);

    const lotId = await store.transaction((tx) => tx.openTechnicalLot({ productId, locationId }));

    const [stored] = await db.select().from(lots);
    expect(stored).toMatchObject({
      id: lotId,
      productId,
      locationId,
      technical: true,
      purchaseLineId: null,
      purchasedOn: null,
      expiresOn: null,
      costTotalCents: null,
      costQuantity: null,
      costIncomplete: true,
      quantityReceived: 0,
      remaining: 0,
    });
    const found = await store.transaction((tx) => tx.productLots({ productId, locationId }));
    expect(found).toMatchObject([{ id: lotId, technical: true, purchasedOn: null }]);
  });

  it("refuses a second technical lot for the same product in the same branch", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const store = new DrizzleStockStore(db);
    await store.transaction((tx) => tx.openTechnicalLot({ productId, locationId }));

    await expect(
      store.transaction((tx) => tx.openTechnicalLot({ productId, locationId })),
    ).rejects.toMatchObject({ cause: { constraint: "lots_one_technical_per_product_branch" } });
    await expect(
      store.transaction((tx) => tx.openTechnicalLot({ productId, locationId: otherLocationId })),
    ).resolves.toEqual(expect.any(String));
  });

  it("records each allocation against its movement and adds its signed quantity to the lot's remaining", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId, remaining: 5000 });
    const first = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -1500,
      occurredAt: NOW,
    });
    const second = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -500,
      occurredAt: NOW,
    });
    const store = new DrizzleStockStore(db);

    await store.transaction(async (tx) => {
      await tx.allocateToLot({ movementId: first, lotId, quantity: -1500 });
      await tx.allocateToLot({ movementId: second, lotId, quantity: -500 });
    });

    const [lot] = await db.select({ remaining: lots.remaining }).from(lots);
    expect(lot).toEqual({ remaining: 3000 });
    const allocations = await db.select().from(lotAllocations);
    expect(allocations).toEqual(
      expect.arrayContaining([
        { movementId: first, lotId, quantity: -1500 },
        { movementId: second, lotId, quantity: -500 },
      ]),
    );
    expect(allocations).toHaveLength(2);
  });

  it("refuses an allocation to a lot that does not exist, leaving no allocation", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const movementId = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: -100,
      occurredAt: NOW,
    });
    const store = new DrizzleStockStore(db);

    await expect(
      store.transaction((tx) =>
        tx.allocateToLot({
          movementId,
          lotId: "00000000-0000-4000-8000-000000000000",
          quantity: -100,
        }),
      ),
    ).rejects.toThrow();
    expect(await db.select().from(lotAllocations)).toEqual([]);
  });
});

describe("DrizzleStockStore lotAllocationsAfter", () => {
  async function allocatedAt(
    productId: string,
    locationId: string,
    actorId: string,
    lotId: string,
    quantity: number,
    occurredAt: Date,
    supersededByCountId?: string,
  ): Promise<string> {
    const movementId = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "loss",
      delta: quantity,
      occurredAt,
      ...(supersededByCountId ? { supersededByCountId } : {}),
    });
    await db.insert(lotAllocations).values({ movementId, lotId, quantity });
    return movementId;
  }

  it("sums, per lot, what applied movements after the moment of the product in the branch allocated", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const otherLotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const elsewhereLotId = await insertPurchasedLot(db, {
      productId,
      locationId: otherLocationId,
      actorId,
    });
    await allocatedAt(productId, locationId, actorId, lotId, -1000, AFTER_COUNT);
    await allocatedAt(productId, locationId, actorId, lotId, -500, NOW);
    await allocatedAt(productId, locationId, actorId, otherLotId, 300, NOW);
    await allocatedAt(productId, locationId, actorId, lotId, -7000, COUNTED_AT);
    await allocatedAt(productId, locationId, actorId, lotId, -8000, BEFORE_COUNT);
    await allocatedAt(productId, otherLocationId, actorId, elsewhereLotId, -9000, AFTER_COUNT);
    const store = new DrizzleStockStore(db);

    const allocated = await store.transaction((tx) =>
      tx.lotAllocationsAfter({ productId, locationId }, COUNTED_AT),
    );

    expect(allocated).toEqual(
      new Map([
        [lotId, -1500],
        [otherLotId, 300],
      ]),
    );
  });

  it("leaves out the movements a later count superseded", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const count = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: NOW,
    });
    await allocatedAt(productId, locationId, actorId, lotId, -1000, AFTER_COUNT, count);
    const store = new DrizzleStockStore(db);

    const allocated = await store.transaction((tx) =>
      tx.lotAllocationsAfter({ productId, locationId }, COUNTED_AT),
    );

    expect(allocated).toEqual(new Map());
  });
});

describe("DrizzleStockStore recordCountedLots", () => {
  it("records the quantity counted of each lot against the count", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const otherLotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const movementId = await seedMovement({
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt: NOW,
    });
    await db.insert(stockCounts).values({ movementId, counted: 3000, expected: 0 });
    const store = new DrizzleStockStore(db);

    await store.transaction((tx) =>
      tx.recordCountedLots(movementId, [
        { lotId, counted: 3000 },
        { lotId: otherLotId, counted: 0 },
      ]),
    );

    expect(await db.select().from(stockCountLots)).toEqual(
      expect.arrayContaining([
        { movementId, lotId, counted: 3000 },
        { movementId, lotId: otherLotId, counted: 0 },
      ]),
    );
  });

  it("registers a count by lot end to end, keeping the lots in line with it", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const soon = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2027-01-01",
      remaining: 4000,
    });
    const late = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2027-06-01",
      remaining: 6000,
    });
    await db.insert(stockBalances).values({ productId, locationId, quantity: 10_000 });

    const outcome = await registerCount(portsAt(NOW), {
      productId,
      locationId,
      lots: [{ lotId: soon, counted: 1000 }],
      occurredAt: COUNTED_AT,
      actorId,
    });

    expect(outcome).toMatchObject({ kind: "recorded", balance: 1000 });
    const remaining = await db.select({ id: lots.id, remaining: lots.remaining }).from(lots);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { id: soon, remaining: 1000 },
        { id: late, remaining: 0 },
      ]),
    );
    expect(await db.select().from(stockCountLots)).toEqual([
      { movementId: expect.any(String), lotId: soon, counted: 1000 },
    ]);
  });
});

describe("DrizzleStockStore initial count", () => {
  const MOVEMENT_ID = "6d1f7c3a-5b2e-4f8a-9c4d-1e2f3a4b5c6d";

  async function count(
    store: DrizzleStockStore<PgliteQueryResultHKT>,
    input: { productId: string; locationId: string; actorId: string },
  ) {
    return store.transaction((tx) =>
      applyOpeningCount(tx, {
        ...input,
        occurredAt: COUNTED_AT,
        movementId: MOVEMENT_ID,
        counted: 6_000,
        expiresOn: "2027-01-31",
      }),
    );
  }

  it("keeps the counted stock in a lot of its own, born from the counting movement with no cost", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct({ saleUnit: "UNIT" });
    const actorId = await insertUser(locationId);

    const outcome = await count(new DrizzleStockStore(db), { productId, locationId, actorId });

    expect(outcome).toEqual({ kind: "recorded", lotId: expect.any(String) });
    expect(await db.select().from(lots)).toEqual([
      expect.objectContaining({
        id: outcome.kind === "recorded" ? outcome.lotId : "",
        productId,
        locationId,
        purchaseLineId: null,
        originMovementId: MOVEMENT_ID,
        technical: false,
        withdrawn: false,
        expiresOn: "2027-01-31",
        purchasedOn: null,
        costIncomplete: true,
        costTotalCents: null,
        costQuantity: null,
        quantityReceived: 6_000,
        remaining: 6_000,
      }),
    ]);
    expect(await db.select().from(stockMovements)).toEqual([
      expect.objectContaining({ id: MOVEMENT_ID, kind: "opening_count", delta: 6_000 }),
    ]);
  });

  it("finds the counted line of its branch only, and says nothing of another branch's", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct({ saleUnit: "UNIT" });
    const actorId = await insertUser(locationId);
    const store = new DrizzleStockStore(db);
    await count(store, { productId, locationId, actorId });

    const found = await store.transaction((tx) => tx.openingCountLot(locationId, MOVEMENT_ID));
    const foreign = await store.transaction((tx) =>
      tx.openingCountLot(otherLocationId, MOVEMENT_ID),
    );

    expect(found).toEqual({
      lotId: expect.any(String),
      productId,
      counted: 6_000,
      withdrawn: false,
    });
    expect(foreign).toBeUndefined();
  });

  it("takes the line back, leaving its lot marked as withdrawn", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct({ saleUnit: "UNIT" });
    const actorId = await insertUser(locationId);
    const store = new DrizzleStockStore(db);
    await count(store, { productId, locationId, actorId });
    const withdrawalId = "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e";

    const outcome = await store.transaction((tx) =>
      withdrawOpeningCount(tx, {
        locationId,
        occurredAt: AFTER_COUNT,
        actorId,
        movementId: withdrawalId,
        withdrawnMovementId: MOVEMENT_ID,
      }),
    );

    expect(outcome).toMatchObject({ kind: "withdrawn", taken: 6_000, notTaken: 0 });
    expect(await db.select().from(lots)).toEqual([
      expect.objectContaining({ withdrawn: true, remaining: 0 }),
    ]);
    expect(await store.transaction((tx) => tx.openingCountLot(locationId, MOVEMENT_ID))).toEqual(
      expect.objectContaining({ withdrawn: true }),
    );
    expect((await db.select().from(stockBalances))[0]).toMatchObject({ quantity: 0 });
  });

  it("records a withdrawal of nothing as a movement when the lot has nothing left to take", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct({ saleUnit: "UNIT" });
    const actorId = await insertUser(locationId);
    const store = new DrizzleStockStore(db);
    await count(store, { productId, locationId, actorId });
    await db.update(lots).set({ remaining: 0 });
    const withdrawalId = "7e2a8d4b-6c3f-4a9b-8d5e-2f3a4b5c6d7e";

    await store.transaction((tx) =>
      withdrawOpeningCount(tx, {
        locationId,
        occurredAt: AFTER_COUNT,
        actorId,
        movementId: withdrawalId,
        withdrawnMovementId: MOVEMENT_ID,
      }),
    );

    expect(
      await db.select().from(stockMovements).where(eq(stockMovements.id, withdrawalId)),
    ).toEqual([expect.objectContaining({ kind: "opening_count_withdrawal", delta: 0 })]);
  });

  it("notes the counting movement as a change of its branch", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct({ saleUnit: "UNIT" });
    const actorId = await insertUser(locationId);
    const before = await lastLoggedChangeSeq(db);

    await count(new DrizzleStockStore(db), { productId, locationId, actorId });

    expect(await changesLoggedAfter(db, before)).toEqual([
      { entity: "stock_movement", entityId: MOVEMENT_ID, version: 1, op: "insert", locationId },
    ]);
  });
});

describe("DrizzleStockStoreTransaction.lotProduct", () => {
  it("answers the product of a lot of the branch", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const store = new DrizzleStockStore(db);

    expect(await store.transaction((tx) => tx.lotProduct(lotId, locationId))).toBe(productId);
  });

  it("answers nothing for a lot of another branch", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertLocation();
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const store = new DrizzleStockStore(db);

    expect(await store.transaction((tx) => tx.lotProduct(lotId, otherLocationId))).toBeUndefined();
  });

  it("answers the product of a lot withdrawn from the initial count", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const { lotId } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      withdrawn: true,
    });
    const store = new DrizzleStockStore(db);

    expect(await store.transaction((tx) => tx.lotProduct(lotId, locationId))).toBe(productId);
  });

  it("answers nothing for an unknown lot", async () => {
    const locationId = await seededLocationId(db);
    const store = new DrizzleStockStore(db);

    expect(
      await store.transaction((tx) =>
        tx.lotProduct("00000000-0000-4000-8000-000000000000", locationId),
      ),
    ).toBeUndefined();
  });
});

describe("discarding an expired lot through the store", () => {
  it("empties the lot, lowers the balance and records a loss for expiry", async () => {
    const locationId = await seededLocationId(db);
    const productId = await insertProduct();
    const actorId = await insertUser(locationId);
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-09-10",
      remaining: 4_000,
    });
    await db.insert(stockBalances).values({ productId, locationId, quantity: 10_000 });

    const outcome = await discardExpiredLot(portsAt(NOW), { lotId, locationId, actorId });

    expect(outcome).toMatchObject({ kind: "discarded", quantity: 4_000, balance: 6_000 });
    expect(await db.select({ remaining: lots.remaining }).from(lots)).toEqual([{ remaining: 0 }]);
    expect(await db.select().from(stockMovements)).toEqual([
      expect.objectContaining({
        productId,
        locationId,
        kind: "loss",
        reason: "expired",
        delta: -4_000,
        occurredAt: NOW,
        actorId,
      }),
    ]);
    expect(await db.select().from(lotAllocations)).toEqual([
      expect.objectContaining({ lotId, quantity: -4_000 }),
    ]);
  });
});
