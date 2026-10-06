import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, passkeys, sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePasskeyRemovalStore } from "./drizzle-passkey-removal-store.js";

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const AT = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T09:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;
let otherUserId: string;
let passkeyId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function insertUser(firstName: string, email: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ firstName, email, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return row.id;
}

async function insertPasskey(owner: string, credentialId: string): Promise<string> {
  const [row] = await db
    .insert(passkeys)
    .values({
      userId: owner,
      credentialId,
      publicKey: "public-key",
      counter: 0,
      transports: null,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Llave",
    })
    .returning({ id: passkeys.id });
  if (!row) {
    throw new Error("test setup: seeding the passkey returned no row");
  }
  return row.id;
}

beforeEach(async () => {
  await testDatabase.clear();
  userId = await insertUser("Ana", "ana@example.test");
  otherUserId = await insertUser("Beto", "beto@example.test");
  passkeyId = await insertPasskey(userId, "credential-1");
  await db.insert(sessions).values([
    { userId, sessionIdHash: "ana-open", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
    {
      userId,
      sessionIdHash: "ana-revoked",
      createdAt: CREATED_AT,
      lastSeenAt: CREATED_AT,
      revokedAt: EARLIER,
    },
    {
      userId: otherUserId,
      sessionIdHash: "beto-open",
      createdAt: CREATED_AT,
      lastSeenAt: CREATED_AT,
    },
  ]);
});

function removalStore() {
  return new DrizzlePasskeyRemovalStore(db, () => AT);
}

describe("DrizzlePasskeyRemovalStore", () => {
  it("finds the passkey of the user and answers its id and name", async () => {
    const found = await removalStore().transaction((tx) =>
      tx.findRemovablePasskey(userId, passkeyId),
    );

    expect(found).toEqual({ id: passkeyId, name: "Llave" });
    expect(await db.select().from(passkeys)).toHaveLength(1);
  });

  it("finds nothing for a passkey another user holds", async () => {
    const found = await removalStore().transaction((tx) =>
      tx.findRemovablePasskey(otherUserId, passkeyId),
    );

    expect(found).toBeUndefined();
  });

  it("deletes the passkey", async () => {
    await removalStore().transaction((tx) => tx.deletePasskey(passkeyId));

    expect(await db.select().from(passkeys)).toEqual([]);
  });

  it("revokes only the open sessions of the user", async () => {
    await removalStore().transaction((tx) => tx.revokeSessions(userId, AT));

    const stored = await db
      .select({ hash: sessions.sessionIdHash, revokedAt: sessions.revokedAt })
      .from(sessions);
    expect(stored).toEqual(
      expect.arrayContaining([
        { hash: "ana-open", revokedAt: AT },
        { hash: "ana-revoked", revokedAt: EARLIER },
        { hash: "beto-open", revokedAt: null },
      ]),
    );
  });

  it("audits an own removal with the passkey's id and name", async () => {
    await removalStore().transaction((tx) =>
      tx.recordOwnPasskeyRemoved(userId, { id: passkeyId, name: "Llave" }),
    );

    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "passkey",
        entityId: passkeyId,
        actorId: userId,
        previousValue: { id: passkeyId, name: "Llave" },
        newValue: null,
      },
    ]);
  });

  it("audits an administrator's removal with the user whose passkey it was", async () => {
    await removalStore().transaction((tx) =>
      tx.recordUserPasskeyRemoved(otherUserId, userId, { id: passkeyId, name: "Llave" }),
    );

    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "passkey",
        entityId: passkeyId,
        actorId: otherUserId,
        previousValue: { id: passkeyId, name: "Llave", userId },
        newValue: null,
      },
    ]);
  });

  it("opens a passkey-changed alert for the user", async () => {
    await removalStore().transaction((tx) =>
      tx.openPasskeyRemovedAlert({
        userId,
        passkeyName: "Llave",
        actorId: otherUserId,
        via: "administrator",
        openedAt: AT,
      }),
    );

    expect(await db.select().from(alerts).where(eq(alerts.scope, userId))).toMatchObject([
      {
        kind: "backoffice_passkey_changed",
        detail: {
          action: "removed",
          passkeyName: "Llave",
          actorId: otherUserId,
          via: "administrator",
        },
        openedAt: AT,
      },
    ]);
  });

  it("rolls back the deletion when the work fails", async () => {
    await expect(
      removalStore().transaction(async (tx) => {
        await tx.deletePasskey(passkeyId);
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");

    expect(await db.select().from(passkeys)).toHaveLength(1);
  });
});
