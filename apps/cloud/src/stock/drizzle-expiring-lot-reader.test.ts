import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleExpiringLotReader } from "./drizzle-expiring-lot-reader.js";
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

async function seededActor(): Promise<{ actorId: string; locationId: string }> {
  const { userId, locationId } = await signedInWith(db, [], new Date("2026-10-01T12:00:00.000Z"));
  return { actorId: userId, locationId };
}

describe("DrizzleExpiringLotReader.lotsExpiringBy", () => {
  it("answers the lots of the branch expiring on or before the last day, with their product and category", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId, categoryId } = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    const onLastDay = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-11-12",
      lotNumber: "L-77",
      remaining: 4_000,
    });
    const expired = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-09-01",
    });
    await insertPurchasedLot(db, { productId, locationId, actorId, expiresOn: "2026-11-13" });
    await insertPurchasedLot(db, { productId, locationId, actorId, expiresOn: null });

    const rows = await new DrizzleExpiringLotReader(db).lotsExpiringBy(locationId, "2026-11-12");

    const product = {
      id: productId,
      name: "Almendras peladas",
      categoryId,
      categoryName: "Frutos secos",
      saleUnit: "KG",
    };
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: onLastDay,
          lotNumber: "L-77",
          expiresOn: "2026-11-12",
          technical: false,
          remaining: 4_000,
          cost: { totalCents: 5_000, quantity: 1_000 },
          costIncomplete: false,
          product,
        },
        expect.objectContaining({ id: expired, expiresOn: "2026-09-01", product }),
      ]),
    );
  });

  it("answers the lots of the asked branch only", async () => {
    const { actorId, locationId } = await seededActor();
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const own = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-10-20",
    });
    await insertPurchasedLot(db, {
      productId,
      locationId: otherLocationId,
      actorId,
      expiresOn: "2026-10-20",
    });

    const rows = await new DrizzleExpiringLotReader(db).lotsExpiringBy(locationId, "2026-11-12");

    expect(rows.map(({ id }) => id)).toEqual([own]);
  });

  it("answers a lot withdrawn from the initial count that still holds stock", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-10-20",
      withdrawn: true,
    });

    const rows = await new DrizzleExpiringLotReader(db).lotsExpiringBy(locationId, "2026-11-12");

    expect(rows.map(({ id }) => id)).toEqual([lotId]);
  });

  it("answers a lot of the initial count with no cost until one is set, and a lot with a cost with it", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const { lotId: withoutCost } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-10-20",
    });
    const { lotId: withCost } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      expiresOn: "2026-10-21",
      unitCostCents: 800,
    });

    const rows = await new DrizzleExpiringLotReader(db).lotsExpiringBy(locationId, "2026-11-12");

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: withoutCost, cost: null, costIncomplete: true }),
        expect.objectContaining({
          id: withCost,
          cost: { totalCents: 800, quantity: 1_000 },
          costIncomplete: false,
        }),
      ]),
    );
  });
});
