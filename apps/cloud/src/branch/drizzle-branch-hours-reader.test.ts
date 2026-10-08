import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchHours, locations } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchHoursReader } from "./drizzle-branch-hours-reader.js";

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

describe("DrizzleBranchHoursReader", () => {
  it("answers no hours for a branch that has none", async () => {
    const locationId = await seededLocationId(db);

    expect(await new DrizzleBranchHoursReader(db).branchHours(locationId)).toEqual([]);
  });

  it("answers only the requested branch's hours by day of week, each time as HH:MM", async () => {
    const locationId = await seededLocationId(db);
    const [otherBranch] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherBranch) {
      throw new Error("test setup: seeding the other branch returned no row");
    }
    await db.insert(branchHours).values([
      { locationId, dayOfWeek: 7, position: 0, opensAt: "10:00", closesAt: "12:00" },
      { locationId, dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
      {
        locationId: otherBranch.id,
        dayOfWeek: 2,
        position: 0,
        opensAt: "08:00",
        closesAt: "09:00",
      },
    ]);

    expect(await new DrizzleBranchHoursReader(db).branchHours(locationId)).toEqual([
      expect.objectContaining({ dayOfWeek: 1, opensAt: "09:00", closesAt: "13:00" }),
      expect.objectContaining({ dayOfWeek: 7, opensAt: "10:00", closesAt: "12:00" }),
    ]);
  });
});
