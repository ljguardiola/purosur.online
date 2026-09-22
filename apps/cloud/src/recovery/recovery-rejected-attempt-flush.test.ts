import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { recordRejectedAttempt } from "./recovery-rejected-attempt-accumulator.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await client.close();
});

function mustExist<T>(value: T | undefined | null, description: string): T {
  if (value === undefined || value === null) {
    throw new Error(`test setup: expected ${description}`);
  }
  return value;
}

async function insertUser(email: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ firstName: "Ada", email })
    .returning({ id: users.id });
  return mustExist(row, "inserting the user to return a row").id;
}

async function insertToken(userId: string, rawToken: string): Promise<void> {
  await db.insert(recoveryTokens).values({
    userId,
    tokenHash: hashRecoveryToken(rawToken),
    expiresAt: new Date("2026-01-05T12:15:00.000Z"),
    voidedAt: new Date("2026-01-05T12:15:00.000Z"),
  });
}

const CLOSED_NOW = new Date("2026-01-05T13:05:00.000Z");
const OPEN_NOW = new Date("2026-01-05T12:30:00.000Z");

describe("flushClosedRecoveryRejectedAttemptWindows", () => {
  it("does nothing when no accumulator row's window has closed yet", async () => {
    await insertUser("ada@example.com");
    await recordRejectedAttempt(db, {
      kind: "request",
      keyHash: hashDestinationAddress("ada@example.com"),
      now: new Date("2026-01-05T12:10:00.000Z"),
    });

    await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => OPEN_NOW });

    await expect(db.select().from(auditLog)).resolves.toEqual([]);
    await expect(db.select().from(recoveryRejectedAttemptAccumulator)).resolves.toHaveLength(1);
  });

  it("resolves a request-kind key to its account and writes one grouped audit row, then deletes the accumulator row", async () => {
    const userId = await insertUser("ada@example.com");
    const first = new Date("2026-01-05T12:05:00.000Z");
    const last = new Date("2026-01-05T12:50:00.000Z");
    await recordRejectedAttempt(db, {
      kind: "request",
      keyHash: hashDestinationAddress("ada@example.com"),
      now: first,
    });
    await recordRejectedAttempt(db, {
      kind: "request",
      keyHash: hashDestinationAddress("ada@example.com"),
      now: last,
    });

    await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityId: userId,
      actorId: userId,
      at: last,
      newValue: {
        attempt: "request",
        rejectedWith: "rate_limited",
        count: 2,
        firstAt: first.toISOString(),
        lastAt: last.toISOString(),
      },
    });
    await expect(db.select().from(recoveryRejectedAttemptAccumulator)).resolves.toEqual([]);
  });

  it("resolves a token-kind key to the token's account and merges several tokens of the same account into one row", async () => {
    const userId = await insertUser("ada@example.com");
    await insertToken(userId, "raw-token-old");
    await insertToken(userId, "raw-token-newer");
    const first = new Date("2026-01-05T12:05:00.000Z");
    const last = new Date("2026-01-05T12:50:00.000Z");
    await recordRejectedAttempt(db, {
      kind: "redeem",
      keyHash: hashRecoveryToken("raw-token-old"),
      now: first,
    });
    await recordRejectedAttempt(db, {
      kind: "redeem",
      keyHash: hashRecoveryToken("raw-token-newer"),
      now: last,
    });

    await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityId: userId,
      actorId: userId,
      newValue: { attempt: "redeem", rejectedWith: "rate_limited", count: 2 },
    });
  });

  it("keeps registration_options and redeem as separate audit rows for the same account and window", async () => {
    const userId = await insertUser("ada@example.com");
    await insertToken(userId, "raw-token-a");
    const at = new Date("2026-01-05T12:05:00.000Z");
    await recordRejectedAttempt(db, {
      kind: "registration_options",
      keyHash: hashRecoveryToken("raw-token-a"),
      now: at,
    });
    await recordRejectedAttempt(db, {
      kind: "redeem",
      keyHash: hashRecoveryToken("raw-token-a"),
      now: at,
    });

    await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => (row.newValue as { attempt: string }).attempt).sort()).toEqual([
      "redeem",
      "registration_options",
    ]);
  });

  it("drops a key that resolves to no account, writing no audit row", async () => {
    await recordRejectedAttempt(db, {
      kind: "request",
      keyHash: hashDestinationAddress("unknown@example.com"),
      now: new Date("2026-01-05T12:05:00.000Z"),
    });
    await recordRejectedAttempt(db, {
      kind: "redeem",
      keyHash: hashRecoveryToken("unknown-raw-token"),
      now: new Date("2026-01-05T12:05:00.000Z"),
    });

    await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW });

    await expect(db.select().from(auditLog)).resolves.toEqual([]);
    await expect(db.select().from(recoveryRejectedAttemptAccumulator)).resolves.toEqual([]);
  });

  it("flushes each closed window separately when more than one is closed", async () => {
    const userId = await insertUser("ada@example.com");
    await recordRejectedAttempt(db, {
      kind: "request",
      keyHash: hashDestinationAddress("ada@example.com"),
      now: new Date("2026-01-05T10:05:00.000Z"),
    });
    await recordRejectedAttempt(db, {
      kind: "request",
      keyHash: hashDestinationAddress("ada@example.com"),
      now: new Date("2026-01-05T11:05:00.000Z"),
    });

    await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.entityId === userId)).toBe(true);
  });
});
