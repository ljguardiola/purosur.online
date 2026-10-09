import type { RejectedAttemptFlushStoreTransaction } from "@purosur/domain/credentials/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRejectedAttemptFlushStore } from "./drizzle-rejected-attempt-flush-store.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

const CLOSED_BEFORE = new Date("2026-01-05T12:50:00.000Z");
const FIRST_WINDOW = new Date("2026-01-05T11:00:00.000Z");
const SECOND_WINDOW = new Date("2026-01-05T12:00:00.000Z");
const OPEN_WINDOW = new Date("2026-01-05T13:00:00.000Z");

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

function inTransaction<TOutcome>(
  work: (tx: RejectedAttemptFlushStoreTransaction) => Promise<TOutcome>,
  chunkSize = 500,
): Promise<TOutcome> {
  return new DrizzleRejectedAttemptFlushStore(db, chunkSize).transaction(work);
}

async function insertUser(email: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ firstName: "Ada", email, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return row.id;
}

async function insertToken(userId: string, rawToken: string): Promise<void> {
  await db.insert(recoveryTokens).values({
    userId,
    tokenHash: hashRecoveryToken(rawToken),
    expiresAt: new Date("2026-01-05T12:15:00.000Z"),
    voidedAt: new Date("2026-01-05T12:15:00.000Z"),
  });
}

async function insertWindow(
  kind: "request" | "registration_options" | "redeem",
  keyHash: string,
  windowStart: Date,
  count = 1,
): Promise<void> {
  await db.insert(recoveryRejectedAttemptAccumulator).values({
    kind,
    keyHash,
    windowStart,
    count,
    firstAt: windowStart,
    lastAt: windowStart,
  });
}

describe("DrizzleRejectedAttemptFlushStore", () => {
  it("takes the closed windows oldest first up to the limit and deletes them", async () => {
    await insertWindow("redeem", "later", SECOND_WINDOW, 2);
    await insertWindow("redeem", "earlier", FIRST_WINDOW, 3);
    await insertWindow("redeem", "open", OPEN_WINDOW);

    const taken = await inTransaction((tx) => tx.takeClosedWindows(CLOSED_BEFORE, 1));

    expect(taken).toEqual([
      {
        kind: "redeem",
        keyHash: "earlier",
        windowStart: FIRST_WINDOW,
        count: 3,
        firstAt: FIRST_WINDOW,
        lastAt: FIRST_WINDOW,
      },
    ]);
    const left = await db.select().from(recoveryRejectedAttemptAccumulator);
    expect(left.map((row) => row.keyHash).sort()).toEqual(["later", "open"]);
  });

  it("resolves destination hashes to the accounts holding the addresses, ignoring the others", async () => {
    const adaId = await insertUser("ada@example.com");
    await insertUser("unrelated@example.com");

    const accounts = await inTransaction(
      (tx) =>
        tx.accountsByDestinationHash([
          hashDestinationAddress("ada@example.com"),
          hashDestinationAddress("nobody@example.com"),
        ]),
      1,
    );

    expect(accounts).toEqual(new Map([[hashDestinationAddress("ada@example.com"), adaId]]));
  });

  it("resolves token hashes to the accounts the tokens belong to", async () => {
    const adaId = await insertUser("ada@example.com");
    await insertToken(adaId, "ada-token");

    const accounts = await inTransaction(
      (tx) => tx.accountsByTokenHash([hashRecoveryToken("ada-token"), hashRecoveryToken("other")]),
      1,
    );

    expect(accounts).toEqual(new Map([[hashRecoveryToken("ada-token"), adaId]]));
  });

  it("takes only the closed token windows of the given accounts' tokens", async () => {
    const adaId = await insertUser("ada@example.com");
    const graceId = await insertUser("grace@example.com");
    await insertToken(adaId, "ada-token");
    await insertToken(graceId, "grace-token");
    await insertWindow("redeem", hashRecoveryToken("ada-token"), FIRST_WINDOW);
    await insertWindow("registration_options", hashRecoveryToken("ada-token"), SECOND_WINDOW);
    await insertWindow("redeem", hashRecoveryToken("ada-token"), OPEN_WINDOW);
    await insertWindow("redeem", hashRecoveryToken("grace-token"), FIRST_WINDOW);
    await insertWindow("request", hashRecoveryToken("ada-token"), FIRST_WINDOW);

    const taken = await inTransaction((tx) => tx.takeClosedTokenWindowsOf([adaId], CLOSED_BEFORE));

    expect(taken.map((window) => window.kind).sort()).toEqual(["redeem", "registration_options"]);
    expect(await db.select().from(recoveryRejectedAttemptAccumulator)).toHaveLength(3);
  });

  it("writes one audit row per flushed account, kind and window, dated at its last attempt", async () => {
    const adaId = await insertUser("ada@example.com");
    const firstAt = new Date("2026-01-05T12:05:00.000Z");
    const lastAt = new Date("2026-01-05T12:40:00.000Z");

    await inTransaction(
      (tx) =>
        tx.recordFlushedAttempts([
          { accountId: adaId, kind: "redeem", count: 4, firstAt, lastAt },
          { accountId: adaId, kind: "request", count: 1, firstAt, lastAt: firstAt },
        ]),
      1,
    );

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.at.getTime() === lastAt.getTime())).toMatchObject({
      entity: "user",
      entityId: adaId,
      actorId: adaId,
      previousValue: null,
      newValue: {
        attempt: "redeem",
        rejectedWith: "rate_limited",
        count: 4,
        firstAt: firstAt.toISOString(),
        lastAt: lastAt.toISOString(),
      },
    });
  });
});
