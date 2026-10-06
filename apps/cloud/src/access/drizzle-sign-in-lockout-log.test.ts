import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { auditLog } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSignInLockoutLog } from "./drizzle-sign-in-lockout-log.js";
import { hashSourceAddress } from "./sign-in-lockout.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

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
  it("records the lockout without an actor and with the hashed source address", async () => {
    await new DrizzleSignInLockoutLog(db, () => NOON).recordLockout({
      lockoutId: LOCKOUT_ID,
      sourceAddress: "203.0.113.10",
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
          sourceAddressHash: hashSourceAddress("203.0.113.10"),
          failureCount: 5,
          blockedUntil: "2026-10-01T12:15:00.000Z",
        },
      },
    ]);
  });
});

describe("DrizzleSignInLockoutLog's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleSignInLockoutLog>
    >();
  });
});
