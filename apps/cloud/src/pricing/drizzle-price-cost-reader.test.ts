import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertInitialCountLot, insertPurchasedLot } from "../stock/test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePriceCostReader } from "./drizzle-price-cost-reader.js";
import { insertPurchaseLine } from "./test-support/purchase-line-fixtures.js";

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

async function setUp() {
  const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
  const { productId } = await insertProduct(db);
  return { actorId, locationId, productId };
}

describe("DrizzlePriceCostReader.costSourcesOf", () => {
  it("answers every purchase line of the product with its exact cost pair and its dates", async () => {
    const { actorId, locationId, productId } = await setUp();
    const earlier = await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-02T15:00:00.000Z"),
      costPaidCents: 1001,
      quantityPerPackage: 2_000,
    });
    const later = await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-03-05",
      recordedAt: new Date("2026-03-05T12:00:00.000Z"),
      costPaidCents: 900,
      quantityPerPackage: 1_000,
    });

    const sources = await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [productId]);

    expect(sources).toHaveLength(2);
    expect(sources).toContainEqual({
      productId,
      source: {
        kind: "purchase_line",
        lineId: earlier,
        purchasedOn: "2026-03-01",
        recordedAt: new Date("2026-03-02T15:00:00.000Z"),
        cost: { totalCents: 1001, quantity: 2_000 },
      },
    });
    expect(sources).toContainEqual({
      productId,
      source: {
        kind: "purchase_line",
        lineId: later,
        purchasedOn: "2026-03-05",
        recordedAt: new Date("2026-03-05T12:00:00.000Z"),
        cost: { totalCents: 900, quantity: 1_000 },
      },
    });
  });

  it("answers an initial-count lot with its count instant, its state and its typed cost", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertInitialCountLot(db, { productId, locationId, actorId, unitCostCents: 700 });

    const sources = await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [productId]);

    expect(sources).toEqual([
      {
        productId,
        source: {
          kind: "initial_count",
          countedAt: new Date("2026-10-01T12:00:00.000Z"),
          withdrawn: false,
          costIncomplete: false,
          cost: { totalCents: 700, quantity: 1_000 },
        },
      },
    ]);
  });

  it("answers an initial-count lot with no typed cost as incomplete, and a withdrawn one as withdrawn", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertInitialCountLot(db, { productId, locationId, actorId });
    await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      withdrawn: true,
      remaining: 0,
      unitCostCents: 500,
    });

    const sources = await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [productId]);

    expect(sources.map(({ source }) => source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "initial_count", costIncomplete: true, cost: null }),
        expect.objectContaining({
          kind: "initial_count",
          withdrawn: true,
          cost: { totalCents: 500, quantity: 1_000 },
        }),
      ]),
    );
  });

  it("answers only the products asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    for (const id of [productId, otherId]) {
      await insertPurchaseLine(db, {
        productId: id,
        locationId,
        actorId,
        purchasedOn: "2026-03-01",
        recordedAt: new Date("2026-03-01T12:00:00.000Z"),
        costPaidCents: 100,
        quantityPerPackage: 1_000,
      });
    }

    const sources = await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [otherId]);

    expect(sources.map((entry) => entry.productId)).toEqual([otherId]);
  });

  it("answers nothing when no product is asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-01T12:00:00.000Z"),
      costPaidCents: 100,
      quantityPerPackage: 1_000,
    });

    expect(await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [])).toEqual([]);
  });

  it("answers only the branch's own purchases and counts", async () => {
    const { actorId, locationId, productId } = await setUp();
    const otherLocationId = await insertLocation(db);
    await insertPurchaseLine(db, {
      productId,
      locationId: otherLocationId,
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-01T12:00:00.000Z"),
      costPaidCents: 100,
      quantityPerPackage: 1_000,
    });
    await insertInitialCountLot(db, {
      productId,
      locationId: otherLocationId,
      actorId,
      unitCostCents: 300,
    });

    expect(await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [productId])).toEqual(
      [],
    );
  });

  it("answers a purchase line once, though its lot exists too", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchasedLot(db, { productId, locationId, actorId });

    const sources = await new DrizzlePriceCostReader(db).costSourcesOf(locationId, [productId]);

    expect(sources.map(({ source }) => source.kind)).toEqual(["purchase_line"]);
  });
});

describe("DrizzlePriceCostReader.isActiveProduct", () => {
  it("is true for an active product", async () => {
    const { productId } = await setUp();

    expect(await new DrizzlePriceCostReader(db).isActiveProduct(productId)).toBe(true);
  });

  it("is false for an inactive product and for one that does not exist", async () => {
    const { productId } = await insertProduct(db, { name: "Retirado", active: false });

    const reader = new DrizzlePriceCostReader(db);

    expect(await reader.isActiveProduct(productId)).toBe(false);
    expect(await reader.isActiveProduct("00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});
