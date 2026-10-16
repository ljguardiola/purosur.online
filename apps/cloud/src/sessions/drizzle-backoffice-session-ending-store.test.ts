import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBackofficeSessionEndingStore } from "./drizzle-backoffice-session-ending-store.js";

const CREATED_AT = new Date("2026-10-01T11:30:00.000Z");
const LAST_SEEN_AT = new Date("2026-10-01T11:55:00.000Z");
const EARLIER = new Date("2026-10-01T11:40:00.000Z");
const AT = new Date("2026-10-01T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let anaId: string;
let betoId: string;

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

beforeEach(async () => {
  await testDatabase.clear();
  anaId = await insertUser("Ana", "ana@example.test");
  betoId = await insertUser("Beto", "beto@example.test");
  await db.insert(sessions).values([
    { userId: anaId, sessionIdHash: "ana-open", createdAt: CREATED_AT, lastSeenAt: LAST_SEEN_AT },
    {
      userId: anaId,
      sessionIdHash: "ana-revoked",
      createdAt: CREATED_AT,
      lastSeenAt: CREATED_AT,
      revokedAt: EARLIER,
    },
    { userId: betoId, sessionIdHash: "beto-open", createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
  ]);
});

function endingStore() {
  return new DrizzleBackofficeSessionEndingStore(db);
}

function storedSessions() {
  return db
    .select({
      id: sessions.id,
      hash: sessions.sessionIdHash,
      userId: sessions.userId,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .orderBy(asc(sessions.sessionIdHash));
}

describe("DrizzleBackofficeSessionEndingStore", () => {
  it("answers every session not yet revoked, with what decides whether it expired", async () => {
    const stored = await storedSessions();
    const idOf = (hash: string) => stored.find((session) => session.hash === hash)?.id;

    const unrevoked = await endingStore().transaction((tx) => tx.lockUnrevokedSessions());

    expect(unrevoked).toHaveLength(2);
    expect(unrevoked).toEqual(
      expect.arrayContaining([
        { id: idOf("ana-open"), userId: anaId, createdAt: CREATED_AT, lastSeenAt: LAST_SEEN_AT },
        { id: idOf("beto-open"), userId: betoId, createdAt: CREATED_AT, lastSeenAt: CREATED_AT },
      ]),
    );
  });

  it("revokes exactly the sessions it is given, at the moment given", async () => {
    const [anaOpen] = (await storedSessions()).filter((session) => session.hash === "ana-open");
    if (!anaOpen) {
      throw new Error("test setup: no open session of Ana stored");
    }

    await endingStore().transaction((tx) => tx.endSessions([anaOpen.id], AT));

    expect((await storedSessions()).map(({ hash, revokedAt }) => ({ hash, revokedAt }))).toEqual([
      { hash: "ana-open", revokedAt: AT },
      { hash: "ana-revoked", revokedAt: EARLIER },
      { hash: "beto-open", revokedAt: null },
    ]);
  });

  it("revokes nothing when it is given no session", async () => {
    await endingStore().transaction((tx) => tx.endSessions([], AT));

    expect((await storedSessions()).map(({ hash, revokedAt }) => ({ hash, revokedAt }))).toEqual([
      { hash: "ana-open", revokedAt: null },
      { hash: "ana-revoked", revokedAt: EARLIER },
      { hash: "beto-open", revokedAt: null },
    ]);
  });

  it("audits an ended session with the actor, its user and the moment it ended", async () => {
    const [session] = await storedSessions();
    if (!session) {
      throw new Error("test setup: no session stored");
    }

    await endingStore().transaction((tx) =>
      tx.recordSessionEnded(betoId, { id: session.id, userId: session.userId }, AT),
    );

    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "session",
        entityId: session.id,
        actorId: betoId,
        previousValue: { user_id: session.userId },
        newValue: { revoked_at: AT.toISOString() },
        at: AT,
      },
    ]);
  });

  it("rolls back the revocation when the work fails", async () => {
    const sessionIds = (await storedSessions()).map((session) => session.id);

    await expect(
      endingStore().transaction(async (tx) => {
        await tx.endSessions(sessionIds, AT);
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");

    expect(
      (await storedSessions()).filter((session) => session.revokedAt?.getTime() === AT.getTime()),
    ).toEqual([]);
  });
});
