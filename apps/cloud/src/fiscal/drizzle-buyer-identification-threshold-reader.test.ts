import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buyerIdentificationThresholds, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBuyerIdentificationThresholdReader } from "./drizzle-buyer-identification-threshold-reader.js";

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

async function insertActor(): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

describe("DrizzleBuyerIdentificationThresholdReader", () => {
  it("answers no thresholds while none was recorded", async () => {
    const reader = new DrizzleBuyerIdentificationThresholdReader(db);

    expect(await reader.listBuyerIdentificationThresholds()).toEqual([]);
  });

  it("answers every threshold, the one that starts last first", async () => {
    const actorId = await insertActor();
    await db.insert(buyerIdentificationThresholds).values([
      { amount: 2_000_000, validFrom: "2026-06-01", recordedBy: actorId },
      { amount: 3_500_000_000, validFrom: "2026-10-01", recordedBy: actorId },
      { amount: 1_000_000, validFrom: "2026-01-01", recordedBy: actorId },
    ]);
    const reader = new DrizzleBuyerIdentificationThresholdReader(db);

    const thresholds = await reader.listBuyerIdentificationThresholds();

    expect(thresholds.map(({ amount, validFrom }) => [amount, validFrom])).toEqual([
      [3_500_000_000, "2026-10-01"],
      [2_000_000, "2026-06-01"],
      [1_000_000, "2026-01-01"],
    ]);
  });
});
