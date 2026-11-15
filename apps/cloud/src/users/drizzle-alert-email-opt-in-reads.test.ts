import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzleAlertEmailOptInReads } from "./drizzle-alert-email-opt-in-reads.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let branch: string;

const OPTED_IN_AT = new Date("2026-09-01T10:00:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  branch = await seededLocationId(db);
});

async function insertUser(input: {
  locationId?: string;
  active?: boolean;
  alertEmailOptedInAt: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: `ada-${crypto.randomUUID()}@example.com`,
      locationId: input.locationId ?? branch,
      active: input.active ?? true,
      alertEmailOptedInAt: input.alertEmailOptedInAt,
    })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding a user returned no row");
  }
  return row.id;
}

describe("drizzleAlertEmailOptInReads", () => {
  it("answers since when an active user of the branch receives alerts by email", async () => {
    const userId = await insertUser({ alertEmailOptedInAt: OPTED_IN_AT });

    expect(await drizzleAlertEmailOptInReads(db).findAlertEmailOptIn(userId, branch)).toEqual({
      optedInAt: OPTED_IN_AT,
    });
  });

  it("answers no moment for a user who has not opted in", async () => {
    const userId = await insertUser({ alertEmailOptedInAt: null });

    expect(await drizzleAlertEmailOptInReads(db).findAlertEmailOptIn(userId, branch)).toEqual({
      optedInAt: null,
    });
  });

  it("finds no user of another branch, no deactivated user and no unknown id", async () => {
    const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
    const elsewhere = await insertUser({
      locationId: location?.id,
      alertEmailOptedInAt: OPTED_IN_AT,
    });
    const deactivated = await insertUser({ active: false, alertEmailOptedInAt: OPTED_IN_AT });
    const reads = drizzleAlertEmailOptInReads(db);

    expect(await reads.findAlertEmailOptIn(elsewhere, branch)).toBeUndefined();
    expect(await reads.findAlertEmailOptIn(deactivated, branch)).toBeUndefined();
    expect(await reads.findAlertEmailOptIn(crypto.randomUUID(), branch)).toBeUndefined();
  });
});
