import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertEmailRecipientReader } from "./drizzle-alert-email-recipient-reader.js";

const NOON = new Date("2026-10-01T12:00:00.000Z");

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

async function insertUser(values: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
      ...values,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user.id;
}

describe("DrizzleAlertEmailRecipientReader", () => {
  it("answers the recipient's email, that they are active and that their opt-in is recorded", async () => {
    const userId = await insertUser({ alertEmailOptedInAt: NOON });

    await expect(
      new DrizzleAlertEmailRecipientReader(db).alertEmailRecipient(userId),
    ).resolves.toEqual({ email: "ada@example.com", active: true, alertEmailOptedIn: true });
  });

  it("answers a deactivated recipient with no opt-in recorded as such", async () => {
    const userId = await insertUser({ active: false, alertEmailOptedInAt: null });

    await expect(
      new DrizzleAlertEmailRecipientReader(db).alertEmailRecipient(userId),
    ).resolves.toEqual({ email: "ada@example.com", active: false, alertEmailOptedIn: false });
  });

  it("answers no recipient for a user that does not exist", async () => {
    await expect(
      new DrizzleAlertEmailRecipientReader(db).alertEmailRecipient(randomUUID()),
    ).resolves.toBeUndefined();
  });
});
