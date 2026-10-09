import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buyerIdentificationThresholds, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { removeSeededThreshold } from "../test-support/remove-seeded-threshold.js";
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
  await removeSeededThreshold(testDatabase.db);
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
  it("answers nothing in effect and nothing scheduled while none was recorded", async () => {
    const reader = new DrizzleBuyerIdentificationThresholdReader(db);

    expect(await reader.readBuyerIdentificationThresholdOverview("2026-07-01")).toEqual({
      inEffect: undefined,
      scheduled: undefined,
    });
  });

  it("answers the threshold in effect on the day, and the next one scheduled", async () => {
    const actorId = await insertActor();
    await db.insert(buyerIdentificationThresholds).values([
      { amount: 2_000_000, validFrom: "2026-06-01", recordedBy: actorId },
      { amount: 3_500_000_000, validFrom: "2026-10-01", recordedBy: actorId },
      { amount: 1_000_000, validFrom: "2026-01-01", recordedBy: actorId },
      { amount: 3_000_000, validFrom: "2026-08-01", recordedBy: actorId },
    ]);
    const reader = new DrizzleBuyerIdentificationThresholdReader(db);

    const overview = await reader.readBuyerIdentificationThresholdOverview("2026-07-01");

    expect(overview).toEqual({
      inEffect: { id: expect.any(String), amount: 2_000_000, validFrom: "2026-06-01", revision: 0 },
      scheduled: {
        id: expect.any(String),
        amount: 3_000_000,
        validFrom: "2026-08-01",
        revision: 0,
      },
    });
  });

  it("answers the highest revision of a day, not the replaced rows", async () => {
    const actorId = await insertActor();
    await db.insert(buyerIdentificationThresholds).values([
      { amount: 10_000_000, validFrom: "2026-06-01", revision: 1, recordedBy: actorId },
      { amount: 10_000, validFrom: "2026-06-01", revision: 0, recordedBy: actorId },
      { amount: 5_000, validFrom: "2026-08-01", revision: 0, recordedBy: actorId },
      { amount: 6_000, validFrom: "2026-08-01", revision: 3, recordedBy: actorId },
    ]);
    const reader = new DrizzleBuyerIdentificationThresholdReader(db);

    const overview = await reader.readBuyerIdentificationThresholdOverview("2026-07-01");

    expect(overview.inEffect).toMatchObject({ amount: 10_000_000, revision: 1 });
    expect(overview.scheduled).toMatchObject({ amount: 6_000, revision: 3 });
  });
});
