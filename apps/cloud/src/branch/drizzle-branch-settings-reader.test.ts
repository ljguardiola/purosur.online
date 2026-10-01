import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchHours, branchSettings, locations } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzleBranchSettingsReader } from "./drizzle-branch-settings-reader.js";

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

describe("DrizzleBranchSettingsReader", () => {
  it("answers the seeded branch's defaults at version 1, with no hours", async () => {
    const locationId = await seededLocationId(db);

    expect(await new DrizzleBranchSettingsReader(db).currentBranchSettings(locationId)).toEqual({
      address: "",
      whatsappNumber: "",
      instagramHandle: "",
      hours: [],
      expiringLotAlertDays: 30,
      unreviewedPriceAlertDays: 30,
      goodConditionReturnDays: 15,
      version: 1,
    });
  });

  it("answers the hours by day then position, each time as HH:MM", async () => {
    const locationId = await seededLocationId(db);
    await db.insert(branchHours).values([
      { locationId, dayOfWeek: 2, position: 0, opensAt: "10:30", closesAt: "14:00" },
      { locationId, dayOfWeek: 1, position: 1, opensAt: "17:00", closesAt: "21:00" },
      { locationId, dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
    ]);

    const { hours } = await new DrizzleBranchSettingsReader(db).currentBranchSettings(locationId);

    expect(hours).toEqual([
      { dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
      { dayOfWeek: 1, position: 1, opensAt: "17:00", closesAt: "21:00" },
      { dayOfWeek: 2, position: 0, opensAt: "10:30", closesAt: "14:00" },
    ]);
  });

  it("answers only the requested branch's settings and hours", async () => {
    const locationId = await seededLocationId(db);
    await db
      .update(branchSettings)
      .set({ address: "Av. Centro 100" })
      .where(eq(branchSettings.locationId, locationId));
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db.insert(branchSettings).values({
      locationId: otherLocation.id,
      address: "Av. Norte 200",
      priceListId: await seededPriceListId(db),
    });
    await db.insert(branchHours).values({
      locationId: otherLocation.id,
      dayOfWeek: 3,
      position: 0,
      opensAt: "08:00",
      closesAt: "12:00",
    });

    const settings = await new DrizzleBranchSettingsReader(db).currentBranchSettings(locationId);

    expect(settings).toMatchObject({ address: "Av. Centro 100", hours: [] });
  });

  it("fails for a branch with no settings row", async () => {
    await expect(
      new DrizzleBranchSettingsReader(db).currentBranchSettings(
        "00000000-0000-4000-8000-000000000000",
      ),
    ).rejects.toThrow("branch settings missing for location");
  });
});
