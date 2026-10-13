import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertPurchasedLot } from "../stock/test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePurchaseCostReader } from "./drizzle-purchase-cost-reader.js";
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

describe("DrizzlePurchaseCostReader.purchaseLineCostsOf", () => {
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

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual({
      productId,
      lineId: earlier,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-02T15:00:00.000Z"),
      cost: { totalCents: 1001, quantity: 2_000 },
      freights: [],
    });
    expect(lines).toContainEqual({
      productId,
      lineId: later,
      purchasedOn: "2026-03-05",
      recordedAt: new Date("2026-03-05T12:00:00.000Z"),
      cost: { totalCents: 900, quantity: 1_000 },
      freights: [],
    });
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

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      otherId,
    ]);

    expect(lines.map((line) => line.productId)).toEqual([otherId]);
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

    expect(await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [])).toEqual([]);
  });

  it("answers only the branch's own purchases", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchaseLine(db, {
      productId,
      locationId: await insertLocation(db),
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-01T12:00:00.000Z"),
      costPaidCents: 100,
      quantityPerPackage: 1_000,
    });

    expect(
      await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [productId]),
    ).toEqual([]);
  });

  it("answers a purchase line once, though its lot exists too", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchasedLot(db, { productId, locationId, actorId });

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(lines).toHaveLength(1);
  });
});
