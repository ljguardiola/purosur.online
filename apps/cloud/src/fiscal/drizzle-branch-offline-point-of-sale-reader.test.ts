import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  locations,
  offlinePointOfSaleRetirements,
  registers,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchOfflinePointOfSaleReader } from "./drizzle-branch-offline-point-of-sale-reader.js";
import {
  configureOfflinePointOfSale,
  moveRegisterToOfflinePointOfSale,
} from "./test-support/offline-point-of-sale-fixtures.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

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

describe("listing a branch's offline points of sale through DrizzleBranchOfflinePointOfSaleReader", () => {
  it("lists every offline number a register of the branch claimed, by number, with its register, whether it is assigned and when it was retired", async () => {
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "Caja 1",
      realTimePointOfSale: 7,
      offlinePointOfSale: 8,
      now: NOON,
    });
    const locationId = await seededLocationId(db);
    const [actor] = await db.select({ id: users.id }).from(users);
    if (!actor) {
      throw new Error("test setup: the seeded actor is missing");
    }
    await moveRegisterToOfflinePointOfSale(db, {
      registerId,
      pointOfSaleNumber: 6,
      version: 1,
      now: NOON,
    });
    const retiredAt = new Date("2026-01-06T09:30:00.000Z");
    await db
      .insert(offlinePointOfSaleRetirements)
      .values({ pointOfSaleNumber: 8, retiredAt, retiredBy: actor.id });

    const listed = await new DrizzleBranchOfflinePointOfSaleReader(
      db,
    ).listBranchOfflinePointsOfSale(locationId);

    expect(listed).toEqual([
      { pointOfSaleNumber: 6, registerId, registerName: "Caja 1", assigned: true, retiredAt: null },
      { pointOfSaleNumber: 8, registerId, registerName: "Caja 1", assigned: false, retiredAt },
    ]);
  });

  it("lists no number of another branch's registers, nor a real-time one", async () => {
    await configureOfflinePointOfSale(db, {
      registerName: "Caja 1",
      realTimePointOfSale: 7,
      offlinePointOfSale: 8,
      now: NOON,
    });
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db.insert(registers).values({ locationId: otherLocation.id, name: "Caja 9" });

    const listed = await new DrizzleBranchOfflinePointOfSaleReader(
      db,
    ).listBranchOfflinePointsOfSale(otherLocation.id);

    expect(listed).toEqual([]);
  });
});
