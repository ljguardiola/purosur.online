import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchSettings, locations } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzleBranchExpiryWindowReader } from "./drizzle-branch-expiry-window-reader.js";

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

describe("DrizzleBranchExpiryWindowReader", () => {
  it("answers the seeded branch's default expiry warning window", async () => {
    const locationId = await seededLocationId(db);

    await expect(new DrizzleBranchExpiryWindowReader(db).branchExpiryWindows()).resolves.toEqual([
      { locationId, windowDays: 30 },
    ]);
  });

  it("answers the window each branch configured", async () => {
    const first = await seededLocationId(db);
    await db
      .update(branchSettings)
      .set({ expiringLotAlertDays: 0 })
      .where(eq(branchSettings.locationId, first));
    const [second] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!second) {
      throw new Error("test setup: inserting the second branch returned no row");
    }
    await db.insert(branchSettings).values({
      locationId: second.id,
      expiringLotAlertDays: 45,
      priceListId: await seededPriceListId(db),
    });

    const windows = await new DrizzleBranchExpiryWindowReader(db).branchExpiryWindows();

    expect(windows).toHaveLength(2);
    expect(windows).toEqual(
      expect.arrayContaining([
        { locationId: first, windowDays: 0 },
        { locationId: second.id, windowDays: 45 },
      ]),
    );
  });
});
