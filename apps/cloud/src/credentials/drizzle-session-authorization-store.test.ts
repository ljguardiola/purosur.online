import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { passkeys, sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSessionAuthorizationStore } from "./drizzle-session-authorization-store.js";

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const AT = new Date("2026-10-01T12:00:00.000Z");
const MISSING_ID = "0b6a7c9e-6f43-4c43-9d0e-5f1b7a1c2d3e";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let passkeyId: string;
let sessionId: string;
let otherSessionId: string;

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
  const [passkey] = await db
    .insert(passkeys)
    .values({
      userId: user.id,
      credentialId: "credential-1",
      publicKey: "public-key",
      counter: 4,
      transports: null,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Llave",
    })
    .returning({ id: passkeys.id });
  const opened = await db
    .insert(sessions)
    .values([
      { userId: user.id, sessionIdHash: "one", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
      { userId: user.id, sessionIdHash: "two", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
    ])
    .returning({ id: sessions.id });
  if (!passkey || !opened[0] || !opened[1]) {
    throw new Error("test setup: seeding returned no row");
  }
  passkeyId = passkey.id;
  sessionId = opened[0].id;
  otherSessionId = opened[1].id;
});

function authorizationStore() {
  return new DrizzleSessionAuthorizationStore(db);
}

describe("DrizzleSessionAuthorizationStore", () => {
  it("records the use of the passkey with its new counter", async () => {
    const recording = await authorizationStore().transaction((tx) =>
      tx.recordPasskeyUse({ passkeyId, counter: 5, at: AT }),
    );

    expect(recording).toBe("recorded");
    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, passkeyId));
    expect(passkey).toMatchObject({ counter: 5, lastUsedAt: AT });
  });

  it("finds no passkey to record when it was removed", async () => {
    const recording = await authorizationStore().transaction((tx) =>
      tx.recordPasskeyUse({ passkeyId: MISSING_ID, counter: 5, at: AT }),
    );

    expect(recording).toBe("passkey_removed");
  });

  it("authorizes only the given session at that moment", async () => {
    await authorizationStore().transaction((tx) => tx.authorizeSession(sessionId, AT));

    const [authorized] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const [untouched] = await db.select().from(sessions).where(eq(sessions.id, otherSessionId));
    expect(authorized?.passkeyAuthorizedAt).toEqual(AT);
    expect(untouched?.passkeyAuthorizedAt).toBeNull();
  });

  it("rolls back the passkey use when the work fails", async () => {
    await expect(
      authorizationStore().transaction(async (tx) => {
        await tx.recordPasskeyUse({ passkeyId, counter: 5, at: AT });
        await tx.authorizeSession(sessionId, AT);
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");

    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, passkeyId));
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(passkey).toMatchObject({ counter: 4, lastUsedAt: null });
    expect(session?.passkeyAuthorizedAt).toBeNull();
  });
});
