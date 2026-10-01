import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzleSessionStore } from "./drizzle-session-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const AT = new Date("2026-10-01T12:00:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ana",
      email: "ana@example.test",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  userId = user.id;
  await db.insert(sessions).values([
    { userId, sessionIdHash: "hash-1", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
    { userId, sessionIdHash: "hash-2", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
  ]);
});

function storedSessions() {
  return db
    .select({
      hash: sessions.sessionIdHash,
      lastSeenAt: sessions.lastSeenAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .orderBy(asc(sessions.sessionIdHash));
}

describe("drizzleSessionStore", () => {
  it("ends only the session of the given key", async () => {
    await drizzleSessionStore(db).endSession("hash-1", AT);

    expect(await storedSessions()).toEqual([
      { hash: "hash-1", lastSeenAt: CREATED_AT, revokedAt: AT },
      { hash: "hash-2", lastSeenAt: CREATED_AT, revokedAt: null },
    ]);
  });

  it("records activity only on the session of the given key", async () => {
    await drizzleSessionStore(db).recordSessionActivity("hash-2", AT);

    expect(await storedSessions()).toEqual([
      { hash: "hash-1", lastSeenAt: CREATED_AT, revokedAt: null },
      { hash: "hash-2", lastSeenAt: AT, revokedAt: null },
    ]);
  });

  it("changes nothing for a key no session has", async () => {
    const store = drizzleSessionStore(db);

    await store.endSession("missing", AT);
    await store.recordSessionActivity("missing", AT);

    expect(await storedSessions()).toEqual([
      { hash: "hash-1", lastSeenAt: CREATED_AT, revokedAt: null },
      { hash: "hash-2", lastSeenAt: CREATED_AT, revokedAt: null },
    ]);
  });
});
