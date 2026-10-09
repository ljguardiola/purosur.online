import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { passkeyChallenges, sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePendingPasskeyChallengeStore } from "./drizzle-pending-passkey-challenge-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T11:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let sessionId: string;
let otherSessionId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function insertSession(userId: string, sessionIdHash: string): Promise<string> {
  const [row] = await db
    .insert(sessions)
    .values({ userId, sessionIdHash, createdAt: EARLIER, lastSeenAt: EARLIER })
    .returning({ id: sessions.id });
  if (!row) {
    throw new Error("test setup: seeding the session returned no row");
  }
  return row.id;
}

beforeEach(async () => {
  await testDatabase.clear();
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ana", email: "ana@example.test", locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  sessionId = await insertSession(user.id, "ana-1");
  otherSessionId = await insertSession(user.id, "ana-2");
});

function challengeStore() {
  return new DrizzlePendingPasskeyChallengeStore(db);
}

describe("DrizzlePendingPasskeyChallengeStore", () => {
  it("stores a registration challenge and takes it back with when it was issued", async () => {
    await challengeStore().transaction((tx) =>
      tx.storeChallenge({ sessionId, kind: "registration", challenge: "reg-1", issuedAt: AT }),
    );

    const taken = await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId, kind: "registration" }),
    );

    expect(taken).toEqual({ challenge: "reg-1", issuedAt: AT });
  });

  it("keeps each kind's challenge apart", async () => {
    await challengeStore().transaction(async (tx) => {
      await tx.storeChallenge({
        sessionId,
        kind: "registration",
        challenge: "reg-1",
        issuedAt: AT,
      });
      await tx.storeChallenge({
        sessionId,
        kind: "session_authorization",
        challenge: "auth-1",
        issuedAt: AT,
      });
    });

    const authorization = await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId, kind: "session_authorization" }),
    );
    const registration = await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId, kind: "registration" }),
    );

    expect(authorization?.challenge).toBe("auth-1");
    expect(registration?.challenge).toBe("reg-1");
  });

  it("replaces the challenge the session already held for that kind", async () => {
    await challengeStore().transaction(async (tx) => {
      await tx.storeChallenge({
        sessionId,
        kind: "registration",
        challenge: "old",
        issuedAt: EARLIER,
      });
      await tx.storeChallenge({ sessionId, kind: "registration", challenge: "new", issuedAt: AT });
    });

    expect(await db.select().from(passkeyChallenges)).toMatchObject([
      { sessionId, kind: "registration", registrationChallenge: "new", createdAt: AT },
    ]);
  });

  it("deletes the challenge when it is taken, so it is taken only once", async () => {
    await challengeStore().transaction((tx) =>
      tx.storeChallenge({ sessionId, kind: "registration", challenge: "reg-1", issuedAt: AT }),
    );
    await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId, kind: "registration" }),
    );

    const again = await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId, kind: "registration" }),
    );

    expect(again).toBeUndefined();
    expect(await db.select().from(passkeyChallenges)).toEqual([]);
  });

  it("takes nothing from another session's challenge", async () => {
    await challengeStore().transaction((tx) =>
      tx.storeChallenge({ sessionId, kind: "registration", challenge: "reg-1", issuedAt: AT }),
    );

    const taken = await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId: otherSessionId, kind: "registration" }),
    );

    expect(taken).toBeUndefined();
    expect(await db.select().from(passkeyChallenges)).toHaveLength(1);
  });

  it("takes nothing, but still deletes the row, when it holds no challenge of its kind", async () => {
    await db.insert(passkeyChallenges).values({
      sessionId,
      kind: "registration",
      reauthenticationChallenge: "auth-1",
      createdAt: AT,
    });

    const taken = await challengeStore().transaction((tx) =>
      tx.takeChallenge({ sessionId, kind: "registration" }),
    );

    expect(taken).toBeUndefined();
    expect(await db.select().from(passkeyChallenges)).toEqual([]);
  });

  it("discards the challenges issued at or before the cutoff and keeps the later ones", async () => {
    await challengeStore().transaction(async (tx) => {
      await tx.storeChallenge({
        sessionId,
        kind: "registration",
        challenge: "old",
        issuedAt: EARLIER,
      });
      await tx.storeChallenge({
        sessionId: otherSessionId,
        kind: "registration",
        challenge: "new",
        issuedAt: AT,
      });
    });

    await challengeStore().transaction((tx) => tx.discardChallengesIssuedAtOrBefore(EARLIER));

    expect(
      await db
        .select({ challenge: passkeyChallenges.registrationChallenge })
        .from(passkeyChallenges)
        .where(eq(passkeyChallenges.kind, "registration")),
    ).toEqual([{ challenge: "new" }]);
  });
});
