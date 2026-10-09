import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { passkeys, sessions, signInFailures, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePasskeySignInStore } from "./drizzle-passkey-sign-in-store.js";

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const AT = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T09:00:00.000Z");
const MISSING_ID = "0b6a7c9e-6f43-4c43-9d0e-5f1b7a1c2d3e";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;
let passkeyId: string;
let attemptId: string;

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
  const [passkey] = await db
    .insert(passkeys)
    .values({
      userId,
      credentialId: "credential-1",
      publicKey: "public-key",
      counter: 4,
      transports: null,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Llave",
    })
    .returning({ id: passkeys.id });
  if (!passkey) {
    throw new Error("test setup: seeding the passkey returned no row");
  }
  passkeyId = passkey.id;
  const [attempt] = await db
    .insert(signInFailures)
    .values({ sourceAddress: "203.0.113.10", attemptedAt: CREATED_AT })
    .returning({ id: signInFailures.id });
  if (!attempt) {
    throw new Error("test setup: seeding the sign-in attempt returned no row");
  }
  attemptId = attempt.id;
  await db.insert(sessions).values([
    { userId, sessionIdHash: "open", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
    {
      userId,
      sessionIdHash: "revoked",
      createdAt: CREATED_AT,
      lastSeenAt: CREATED_AT,
      revokedAt: EARLIER,
    },
  ]);
});

function signInStore() {
  return new DrizzlePasskeySignInStore(db);
}

describe("DrizzlePasskeySignInStore", () => {
  it("records the use of the passkey with its new counter", async () => {
    const recording = await signInStore().transaction((tx) =>
      tx.recordPasskeyUse({ passkeyId, counter: 5, at: AT }),
    );

    expect(recording).toBe("recorded");
    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, passkeyId));
    expect(passkey).toMatchObject({ counter: 5, lastUsedAt: AT });
  });

  it("finds no passkey to record when it was removed", async () => {
    const recording = await signInStore().transaction((tx) =>
      tx.recordPasskeyUse({ passkeyId: MISSING_ID, counter: 5, at: AT }),
    );

    expect(recording).toBe("passkey_removed");
  });

  it("ends the session with the given key", async () => {
    await signInStore().transaction((tx) => tx.endSession("open", AT));

    const stored = await db
      .select({ hash: sessions.sessionIdHash, revokedAt: sessions.revokedAt })
      .from(sessions);
    expect(stored).toEqual(
      expect.arrayContaining([
        { hash: "open", revokedAt: AT },
        { hash: "revoked", revokedAt: EARLIER },
      ]),
    );
  });

  it("ends a session even when it was already ended", async () => {
    await signInStore().transaction((tx) => tx.endSession("revoked", AT));

    const [session] = await db.select().from(sessions).where(eq(sessions.sessionIdHash, "revoked"));
    expect(session?.revokedAt).toEqual(AT);
  });

  it("opens a session authorized with the passkey at that moment", async () => {
    await signInStore().transaction((tx) =>
      tx.openSession({ userId, sessionKey: "new-key", at: AT }),
    );

    const [session] = await db.select().from(sessions).where(eq(sessions.sessionIdHash, "new-key"));
    expect(session).toMatchObject({
      userId,
      createdAt: AT,
      lastSeenAt: AT,
      passkeyAuthorizedAt: AT,
      revokedAt: null,
    });
  });

  it("discards the sign-in attempt", async () => {
    await signInStore().transaction((tx) => tx.discardSignInAttempt(attemptId));

    expect(await db.select().from(signInFailures)).toEqual([]);
  });

  it("rolls back every write when the work fails", async () => {
    await expect(
      signInStore().transaction(async (tx) => {
        await tx.recordPasskeyUse({ passkeyId, counter: 5, at: AT });
        await tx.openSession({ userId, sessionKey: "new-key", at: AT });
        await tx.discardSignInAttempt(attemptId);
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");

    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, passkeyId));
    expect(passkey).toMatchObject({ counter: 4, lastUsedAt: null });
    expect(await db.select().from(sessions)).toHaveLength(2);
    expect(await db.select().from(signInFailures)).toHaveLength(1);
  });
});
