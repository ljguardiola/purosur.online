import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInitialCountCostReader } from "./drizzle-initial-count-cost-reader.js";
import { insertInitialCountLot, insertPurchasedLot } from "./test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

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

describe("DrizzleInitialCountCostReader.initialCountCostsOf", () => {
  it("answers an initial-count lot with its count instant, its state and its typed cost", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertInitialCountLot(db, { productId, locationId, actorId, unitCostCents: 700 });

    const counts = await new DrizzleInitialCountCostReader(db).initialCountCostsOf(locationId, [
      productId,
    ]);

    expect(counts).toEqual([
      {
        productId,
        countedAt: new Date("2026-10-01T12:00:00.000Z"),
        withdrawn: false,
        costIncomplete: false,
        cost: { totalCents: 700, quantity: 1_000 },
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

    const counts = await new DrizzleInitialCountCostReader(db).initialCountCostsOf(locationId, [
      productId,
    ]);

    expect(counts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ costIncomplete: true, cost: null }),
        expect.objectContaining({ withdrawn: true, cost: { totalCents: 500, quantity: 1_000 } }),
      ]),
    );
  });

  it("answers only the products asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    for (const id of [productId, otherId]) {
      await insertInitialCountLot(db, { productId: id, locationId, actorId, unitCostCents: 300 });
    }

    const counts = await new DrizzleInitialCountCostReader(db).initialCountCostsOf(locationId, [
      otherId,
    ]);

    expect(counts.map((count) => count.productId)).toEqual([otherId]);
  });

  it("answers nothing when no product is asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertInitialCountLot(db, { productId, locationId, actorId, unitCostCents: 300 });

    expect(await new DrizzleInitialCountCostReader(db).initialCountCostsOf(locationId, [])).toEqual(
      [],
    );
  });

  it("answers only the branch's own counts", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertInitialCountLot(db, {
      productId,
      locationId: await insertLocation(db),
      actorId,
      unitCostCents: 300,
    });

    expect(
      await new DrizzleInitialCountCostReader(db).initialCountCostsOf(locationId, [productId]),
    ).toEqual([]);
  });

  it("answers no lot received from a purchase", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchasedLot(db, { productId, locationId, actorId });

    expect(
      await new DrizzleInitialCountCostReader(db).initialCountCostsOf(locationId, [productId]),
    ).toEqual([]);
  });
});
