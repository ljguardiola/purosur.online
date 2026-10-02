import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSignInLockoutLog } from "./drizzle-sign-in-lockout-log.js";

const LOCKOUT_ID = "0b6a7c9e-6f43-4c43-9d0e-5f1b7a1c2d3e";
const BLOCKED_UNTIL = new Date("2026-10-01T12:15:00.000Z");

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

describe("DrizzleSignInLockoutLog", () => {
  it("records the lockout without an actor and with the hashed address", async () => {
    await new DrizzleSignInLockoutLog(db).recordLockout({
      lockoutId: LOCKOUT_ID,
      sourceAddressHash: "hash-1",
      failureCount: 5,
      blockedUntil: BLOCKED_UNTIL,
    });

    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "backoffice_lockout",
        entityId: LOCKOUT_ID,
        actorId: null,
        previousValue: null,
        newValue: {
          sourceAddressHash: "hash-1",
          failureCount: 5,
          blockedUntil: "2026-10-01T12:15:00.000Z",
        },
      },
    ]);
  });
});
