import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleStockReader } from "./drizzle-stock-reader.js";
import {
  insertBalance,
  insertLocation,
  insertMovement,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const SINCE = new Date("2026-09-01T00:00:00.000Z");
const BEFORE_SINCE = new Date("2026-08-31T23:59:59.000Z");
const MOMENT = new Date("2026-09-15T21:32:00.000Z");
const BEFORE_MOMENT = new Date("2026-09-15T20:00:00.000Z");
const AFTER_MOMENT = new Date("2026-09-15T21:35:00.000Z");
const LATER = new Date("2026-09-15T21:40:00.000Z");

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

async function seededActor(): Promise<{ actorId: string; locationId: string }> {
  const { userId, locationId } = await signedInWith(db, [], LATER);
  return { actorId: userId, locationId };
}

describe("DrizzleStockReader.activeProduct", () => {
  it("answers an active product with its category and sale unit", async () => {
    const { productId, categoryId } = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });

    expect(await new DrizzleStockReader(db).activeProduct(productId)).toEqual({
      id: productId,
      name: "Almendras peladas",
      categoryId,
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
  });

  it("answers nothing for an inactive product", async () => {
    const { productId } = await insertProduct(db, { active: false });

    expect(await new DrizzleStockReader(db).activeProduct(productId)).toBeUndefined();
  });

  it("answers nothing for an id that is not a uuid", async () => {
    expect(await new DrizzleStockReader(db).activeProduct("not-a-uuid")).toBeUndefined();
  });

  it("answers nothing for an unknown product", async () => {
    expect(
      await new DrizzleStockReader(db).activeProduct("00000000-0000-4000-8000-000000000000"),
    ).toBeUndefined();
  });
});

describe("DrizzleStockReader.ledgerAt", () => {
  it("answers the balance and the applied delta after the moment at that location", async () => {
    const { actorId, locationId } = await seededActor();
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const { productId: otherProductId } = await insertProduct(db, { name: "Nueces" });
    await insertBalance(db, { productId, locationId, quantity: 20 });
    await insertBalance(db, { productId, locationId: otherLocationId, quantity: 99 });
    const movement = { productId, locationId, actorId, kind: "loss" as const, reason: "theft" };
    await insertMovement(db, { ...movement, delta: -1, occurredAt: BEFORE_MOMENT });
    await insertMovement(db, { ...movement, delta: -2, occurredAt: MOMENT });
    await insertMovement(db, { ...movement, delta: -3, occurredAt: AFTER_MOMENT });
    await insertMovement(db, {
      ...movement,
      kind: "adjustment",
      reason: "batch_correction",
      delta: 7,
      occurredAt: LATER,
    });
    const coveringCount = await insertMovement(db, {
      ...movement,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: LATER,
      count: { counted: 20, expected: 20 },
    });
    await insertMovement(db, {
      ...movement,
      delta: -50,
      occurredAt: AFTER_MOMENT,
      supersededByCountId: coveringCount,
    });
    await insertMovement(db, {
      ...movement,
      locationId: otherLocationId,
      delta: -40,
      occurredAt: LATER,
    });
    await insertMovement(db, {
      ...movement,
      productId: otherProductId,
      delta: -30,
      occurredAt: LATER,
    });

    expect(await new DrizzleStockReader(db).ledgerAt({ productId, locationId }, MOMENT)).toEqual({
      balance: 20,
      appliedAfterCount: 4,
    });
  });

  it("answers zero for a product with no balance and no movements at that location", async () => {
    const { locationId } = await seededActor();
    const { productId } = await insertProduct(db);

    expect(await new DrizzleStockReader(db).ledgerAt({ productId, locationId }, MOMENT)).toEqual({
      balance: 0,
      appliedAfterCount: 0,
    });
  });
});

describe("DrizzleStockReader.activeProducts", () => {
  it("answers the active products by name, then by id", async () => {
    const nuts = await insertProduct(db, { name: "Nueces", categoryName: "Frutos secos" });
    const honey = await insertProduct(db, { name: "Miel", saleUnit: "KG" });
    const sameName = await insertProduct(db, { name: "Miel" });
    await insertProduct(db, { name: "Avena", active: false });

    const products = await new DrizzleStockReader(db).activeProducts();

    const [firstHoney, secondHoney] = [honey, sameName].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    expect(products.map((product) => product.id)).toEqual([
      firstHoney?.productId,
      secondHoney?.productId,
      nuts.productId,
    ]);
    expect(products.find((product) => product.id === honey.productId)).toEqual({
      id: honey.productId,
      name: "Miel",
      categoryId: honey.categoryId,
      categoryName: "Almacén",
      saleUnit: "KG",
    });
  });
});

describe("DrizzleStockReader.stockLevels", () => {
  it("answers each active product with its balance at the location, zero when it has none", async () => {
    const locationId = await insertLocation(db);
    const otherLocationId = await insertLocation(db);
    const honey = await insertProduct(db, { name: "Miel" });
    const nuts = await insertProduct(db, { name: "Nueces", categoryName: "Frutos secos" });
    const oats = await insertProduct(db, { name: "Avena", active: false });
    await insertBalance(db, { productId: honey.productId, locationId, quantity: 12 });
    await insertBalance(db, {
      productId: nuts.productId,
      locationId: otherLocationId,
      quantity: 8,
    });
    await insertBalance(db, { productId: oats.productId, locationId, quantity: 3 });

    expect(await new DrizzleStockReader(db).stockLevels(locationId)).toEqual([
      {
        id: honey.productId,
        name: "Miel",
        categoryId: honey.categoryId,
        categoryName: "Almacén",
        saleUnit: "UNIT",
        balance: 12,
      },
      {
        id: nuts.productId,
        name: "Nueces",
        categoryId: nuts.categoryId,
        categoryName: "Frutos secos",
        saleUnit: "UNIT",
        balance: 0,
      },
    ]);
  });
});

describe("DrizzleStockReader.counts", () => {
  it("answers the location's counts since the start, newest first, flagging superseded ones", async () => {
    const { actorId, locationId } = await seededActor();
    const otherLocationId = await insertLocation(db);
    const { productId, categoryId } = await insertProduct(db, { saleUnit: "KG" });
    const count = { productId, locationId, actorId, kind: "count" as const };
    const latest = await insertMovement(db, {
      ...count,
      delta: 2,
      occurredAt: LATER,
      count: { counted: 12, expected: 10 },
    });
    const earlier = await insertMovement(db, {
      ...count,
      delta: -1,
      occurredAt: SINCE,
      supersededByCountId: latest,
      count: { counted: 9, expected: 10 },
    });
    await insertMovement(db, {
      ...count,
      delta: 0,
      occurredAt: BEFORE_SINCE,
      count: { counted: 5, expected: 5 },
    });
    await insertMovement(db, {
      ...count,
      locationId: otherLocationId,
      delta: 0,
      occurredAt: LATER,
      count: { counted: 4, expected: 4 },
    });
    await insertMovement(db, {
      ...count,
      kind: "loss",
      reason: "theft",
      delta: -1,
      occurredAt: LATER,
    });

    expect(await new DrizzleStockReader(db).counts({ locationId, since: SINCE })).toEqual([
      {
        id: latest,
        productId,
        productName: "Miel pura de abeja 1 kg",
        categoryId,
        categoryName: "Almacén",
        saleUnit: "KG",
        occurredAt: LATER,
        expected: 10,
        counted: 12,
        delta: 2,
        superseded: false,
      },
      {
        id: earlier,
        productId,
        productName: "Miel pura de abeja 1 kg",
        categoryId,
        categoryName: "Almacén",
        saleUnit: "KG",
        occurredAt: SINCE,
        expected: 10,
        counted: 9,
        delta: -1,
        superseded: true,
      },
    ]);
  });

  it("orders counts at the same moment by id, highest first", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const { productId: otherProductId } = await insertProduct(db, { name: "Nueces" });
    const count = { locationId, actorId, kind: "count" as const, delta: 0, occurredAt: LATER };
    const ids = [
      await insertMovement(db, { ...count, productId, count: { counted: 1, expected: 1 } }),
      await insertMovement(db, {
        ...count,
        productId: otherProductId,
        count: { counted: 1, expected: 1 },
      }),
    ];

    const counts = await new DrizzleStockReader(db).counts({ locationId, since: SINCE });

    expect(counts.map((row) => row.id)).toEqual([...ids].sort().reverse());
  });
});

describe("DrizzleStockReader.movements", () => {
  it("answers the location's movements of the asked kinds since the start, newest first", async () => {
    const { actorId, locationId } = await seededActor();
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db, { saleUnit: "KG" });
    const movement = { productId, locationId, actorId };
    const count = await insertMovement(db, {
      ...movement,
      kind: "count",
      delta: 0,
      occurredAt: LATER,
      count: { counted: 3, expected: 3 },
    });
    const loss = await insertMovement(db, {
      ...movement,
      kind: "loss",
      reason: "spoiled",
      delta: -2,
      occurredAt: AFTER_MOMENT,
    });
    const adjustment = await insertMovement(db, {
      ...movement,
      kind: "adjustment",
      reason: "purchase_correction",
      delta: 5,
      occurredAt: SINCE,
      supersededByCountId: count,
    });
    await insertMovement(db, {
      ...movement,
      kind: "loss",
      reason: "theft",
      delta: -1,
      occurredAt: BEFORE_SINCE,
    });
    await insertMovement(db, {
      ...movement,
      locationId: otherLocationId,
      kind: "loss",
      reason: "theft",
      delta: -1,
      occurredAt: LATER,
    });

    expect(
      await new DrizzleStockReader(db).movements({
        locationId,
        since: SINCE,
        kinds: ["loss", "adjustment"],
      }),
    ).toEqual([
      {
        id: loss,
        productId,
        productName: "Miel pura de abeja 1 kg",
        categoryName: "Almacén",
        saleUnit: "KG",
        kind: "loss",
        reason: "spoiled",
        delta: -2,
        occurredAt: AFTER_MOMENT,
        superseded: false,
      },
      {
        id: adjustment,
        productId,
        productName: "Miel pura de abeja 1 kg",
        categoryName: "Almacén",
        saleUnit: "KG",
        kind: "adjustment",
        reason: "purchase_correction",
        delta: 5,
        occurredAt: SINCE,
        superseded: true,
      },
    ]);
  });

  it("answers only the asked kinds", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const movement = { productId, locationId, actorId, occurredAt: LATER };
    const loss = await insertMovement(db, {
      ...movement,
      kind: "loss",
      reason: "theft",
      delta: -1,
    });
    await insertMovement(db, {
      ...movement,
      kind: "adjustment",
      reason: "batch_correction",
      delta: 1,
    });

    const movements = await new DrizzleStockReader(db).movements({
      locationId,
      since: SINCE,
      kinds: ["loss"],
    });

    expect(movements.map((row) => row.id)).toEqual([loss]);
  });

  it("orders movements at the same moment by id, highest first", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const movement = { productId, locationId, actorId, occurredAt: LATER, kind: "loss" as const };
    const ids = [
      await insertMovement(db, { ...movement, reason: "theft", delta: -1 }),
      await insertMovement(db, { ...movement, reason: "spoiled", delta: -2 }),
    ];

    const movements = await new DrizzleStockReader(db).movements({
      locationId,
      since: SINCE,
      kinds: ["loss", "adjustment"],
    });

    expect(movements.map((row) => row.id)).toEqual([...ids].sort().reverse());
  });
});
