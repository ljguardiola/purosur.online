import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, recoveryTokens, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRecoveryTokenStore } from "./drizzle-recovery-token-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;

const REQUESTED_AT = new Date("2026-10-01T11:59:00.000Z");
const ISSUED_AT = new Date("2026-10-01T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-10-01T12:15:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const [row] = await db
    .insert(users)
    .values({ firstName: "Ada", email: "ada@example.com", locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding the user returned no row");
  }
  userId = row.id;
});

async function insertOtherUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      firstName: "Otra",
      email: "otra@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding the other user returned no row");
  }
  return row.id;
}

const store = () => new DrizzleRecoveryTokenStore(db);

function newToken(tokenHash: string, requestId: string, requestedAt = REQUESTED_AT) {
  return {
    userId,
    tokenHash,
    requestedAt,
    requestId,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
  };
}

const REQUEST_A = "6f1b1c7e-0000-4000-8000-00000000000a";
const REQUEST_B = "6f1b1c7e-0000-4000-8000-00000000000b";

describe("finding an account by email", () => {
  it("answers the account's id and whether it is active", async () => {
    expect(await store().findAccountByEmail("ada@example.com")).toEqual({
      id: userId,
      active: true,
    });
  });

  it("answers an inactive account as inactive", async () => {
    await db.update(users).set({ active: false }).where(eq(users.id, userId));

    expect(await store().findAccountByEmail("ada@example.com")).toEqual({
      id: userId,
      active: false,
    });
  });

  it("answers nothing for an email nobody holds", async () => {
    expect(await store().findAccountByEmail("nobody@example.com")).toBeUndefined();
  });
});

describe("recording a rejected request", () => {
  it.each(["account_inactive", "superseded"] as const)(
    "audits the %s request at the moment it was made",
    async (reason) => {
      await store().recordRejectedRequest({ userId, reason, requestedAt: REQUESTED_AT });

      expect(await db.select().from(auditLog)).toEqual([
        expect.objectContaining({
          entity: "user",
          entityId: userId,
          actorId: userId,
          previousValue: null,
          newValue: { attempt: "request", rejectedWith: reason },
          at: REQUESTED_AT,
        }),
      ]);
    },
  );

  it("audits it inside a transaction too", async () => {
    await store().transaction((tx) =>
      tx.recordRejectedRequest({ userId, reason: "superseded", requestedAt: REQUESTED_AT }),
    );

    expect(await db.select().from(auditLog)).toHaveLength(1);
  });
});

describe("issuing a token", () => {
  it("stores the token with its hash, request and times and answers what it needs to record", async () => {
    const issued = await store().transaction((tx) => tx.issueToken(newToken("hash-a", REQUEST_A)));

    expect(issued).toEqual({ id: expect.any(String), issuedAt: ISSUED_AT, expiresAt: EXPIRES_AT });
    expect(await db.select().from(recoveryTokens)).toEqual([
      {
        id: issued.id,
        userId,
        tokenHash: "hash-a",
        requestedAt: REQUESTED_AT,
        requestId: REQUEST_A,
        issuedAt: ISSUED_AT,
        expiresAt: EXPIRES_AT,
        usedAt: null,
        voidedAt: null,
        registrationChallenge: null,
      },
    ]);
  });

  it("audits the issued token for the account at the moment the request was made", async () => {
    const issued = await store().transaction(async (tx) => {
      const token = await tx.issueToken(newToken("hash-a", REQUEST_A));
      await tx.recordIssuedToken(userId, token, REQUESTED_AT);
      return token;
    });

    expect(await db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        entity: "recovery_token",
        entityId: issued.id,
        actorId: userId,
        previousValue: null,
        newValue: { issuedAt: ISSUED_AT.toISOString(), expiresAt: EXPIRES_AT.toISOString() },
        at: REQUESTED_AT,
      }),
    ]);
  });
});

describe("voiding outstanding tokens", () => {
  it("voids the account's tokens that are neither used nor voided, and only those", async () => {
    const usedAt = new Date("2026-10-01T10:05:00.000Z");
    const voidedAt = new Date("2026-10-01T10:06:00.000Z");
    const otherId = await insertOtherUser();
    await db.insert(recoveryTokens).values([
      { ...newToken("outstanding", REQUEST_A), usedAt: null, voidedAt: null },
      { ...newToken("used", REQUEST_B), usedAt },
      { ...newToken("voided", "6f1b1c7e-0000-4000-8000-00000000000c"), voidedAt },
      { ...newToken("other", "6f1b1c7e-0000-4000-8000-00000000000d"), userId: otherId },
    ]);

    await store().transaction((tx) => tx.voidOutstandingRecoveryTokens(userId, ISSUED_AT));

    const rows = await db.select().from(recoveryTokens);
    const tokenHashed = (hash: string) => rows.find((row) => row.tokenHash === hash);
    expect(tokenHashed("outstanding")).toMatchObject({ usedAt: null, voidedAt: ISSUED_AT });
    expect(tokenHashed("used")).toMatchObject({ usedAt, voidedAt: null });
    expect(tokenHashed("voided")).toMatchObject({ usedAt: null, voidedAt });
    expect(tokenHashed("other")).toMatchObject({ voidedAt: null });
  });
});

describe("asking whether a newer request exists", () => {
  async function liveTokenRequestedAt(requestedAt: Date) {
    await db.insert(recoveryTokens).values(newToken("hash-a", REQUEST_A, requestedAt));
  }

  it("is true for a token of the account requested later by another request", async () => {
    await liveTokenRequestedAt(new Date(REQUESTED_AT.getTime() + 1000));

    expect(
      await store().transaction((tx) =>
        tx.hasNewerRequest(userId, { requestId: REQUEST_B, requestedAt: REQUESTED_AT }),
      ),
    ).toBe(true);
  });

  it("is true for a token requested at the same moment by another request", async () => {
    await liveTokenRequestedAt(REQUESTED_AT);

    expect(
      await store().transaction((tx) =>
        tx.hasNewerRequest(userId, { requestId: REQUEST_B, requestedAt: REQUESTED_AT }),
      ),
    ).toBe(true);
  });

  it("is false for an older token, for the request's own token and for another account's token", async () => {
    await db.insert(recoveryTokens).values({
      ...newToken("older", REQUEST_A, new Date(REQUESTED_AT.getTime() - 1000)),
      voidedAt: ISSUED_AT,
    });
    await db.insert(recoveryTokens).values(newToken("own", REQUEST_B));
    const otherId = await insertOtherUser();
    await db.insert(recoveryTokens).values({
      ...newToken("other", "6f1b1c7e-0000-4000-8000-00000000000c", ISSUED_AT),
      userId: otherId,
    });

    expect(
      await store().transaction((tx) =>
        tx.hasNewerRequest(userId, { requestId: REQUEST_B, requestedAt: REQUESTED_AT }),
      ),
    ).toBe(false);
  });
});

describe("locking the account's recovery tokens", () => {
  it("can be taken inside a transaction", async () => {
    await expect(
      store().transaction((tx) => tx.lockRecoveryTokens(userId)),
    ).resolves.toBeUndefined();
  });
});

describe("opening the recovery-requested alert", () => {
  it("opens one for the account with the request and token times, dated at the issue", async () => {
    await store().transaction((tx) =>
      tx.openRecoveryRequestedAlert({
        userId,
        requestedAt: REQUESTED_AT,
        issuedAt: ISSUED_AT,
        expiresAt: EXPIRES_AT,
      }),
    );

    const rows = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.kind, "backoffice_recovery_requested"), eq(alerts.scope, userId)));
    expect(rows).toEqual([
      expect.objectContaining({
        detail: {
          requestedAt: REQUESTED_AT.toISOString(),
          issuedAt: ISSUED_AT.toISOString(),
          expiresAt: EXPIRES_AT.toISOString(),
        },
        openedAt: ISSUED_AT,
      }),
    ]);
  });
});

describe("the transaction", () => {
  it("rolls back every write when the work throws", async () => {
    await expect(
      store().transaction(async (tx) => {
        await tx.issueToken(newToken("hash-a", REQUEST_A));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await db.select().from(recoveryTokens)).toEqual([]);
  });
});
