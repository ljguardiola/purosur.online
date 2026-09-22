import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

// PGlite serializes every query over a single connection and can never race for real, so
// overlapping flushes are proven against a real Postgres with a real pool of more than one
// connection, running them genuinely in parallel over the same closed window.
const CONCURRENT_FLUSHES = 4;
const WINDOW_START = new Date("2026-01-05T12:00:00.000Z");
const CLOSED_NOW = new Date("2026-01-05T13:10:00.000Z");
// More than the 65,535 parameters one Postgres statement can bind.
const UNBOUNDED_KEY_COUNT = 70_000;
const WAIT_POLL_MS = 50;
const WAIT_POLL_ATTEMPTS = 200;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_rejected_attempt_flush_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: CONCURRENT_FLUSHES });
  db = drizzle(sql);
}, 60_000);

function connectAs(applicationName: string): ReturnType<typeof postgres> {
  return postgres(integrationDb.databaseUrl, {
    max: 1,
    connection: { application_name: applicationName },
  });
}

async function waitUntilBlockedOnALock(applicationName: string): Promise<void> {
  for (let attempt = 0; attempt < WAIT_POLL_ATTEMPTS; attempt++) {
    const [row] = await sql<{ blocked: boolean }[]>`
      select exists (
        select 1 from pg_stat_activity
        where application_name = ${applicationName} and wait_event_type = 'Lock'
      ) as blocked
    `;
    if (row?.blocked) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
  throw new Error(`${applicationName} never blocked on a lock`);
}

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("flushClosedRecoveryRejectedAttemptWindows against a real pool", () => {
  it("never double-counts or double-writes when two flushes race over the same closed window", async () => {
    const email = `ada-${randomUUID()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(recoveryRejectedAttemptAccumulator).values({
      kind: "request",
      keyHash: hashDestinationAddress(email),
      windowStart: WINDOW_START,
      count: 3,
      firstAt: new Date("2026-01-05T12:05:00.000Z"),
      lastAt: new Date("2026-01-05T12:50:00.000Z"),
    });

    const outcomes = await Promise.all(
      Array.from({ length: CONCURRENT_FLUSHES }, () =>
        flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW }),
      ),
    );

    expect(outcomes.reduce((total, flushed) => total + flushed, 0)).toBe(1);
    const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.newValue).toMatchObject({ count: 3, rejectedWith: "rate_limited" });
    await expect(db.select().from(recoveryRejectedAttemptAccumulator)).resolves.toEqual([]);
  });

  it("writes one audit row for an account whose several tokens are split across overlapping flushes", async () => {
    const [user] = await db
      .insert(users)
      .values({ firstName: "Grace Hopper", email: `grace-${randomUUID()}@example.com` })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    const rawTokens = Array.from({ length: 8 }, () => randomUUID());
    await db.insert(recoveryTokens).values(
      rawTokens.map((rawToken) => ({
        userId: user.id,
        tokenHash: hashRecoveryToken(rawToken),
        expiresAt: new Date("2026-01-05T12:15:00.000Z"),
        voidedAt: new Date("2026-01-05T12:15:00.000Z"),
      })),
    );
    await db.insert(recoveryRejectedAttemptAccumulator).values(
      rawTokens.map((rawToken) => ({
        kind: "redeem" as const,
        keyHash: hashRecoveryToken(rawToken),
        windowStart: WINDOW_START,
        count: 2,
        firstAt: new Date("2026-01-05T12:05:00.000Z"),
        lastAt: new Date("2026-01-05T12:50:00.000Z"),
      })),
    );

    await Promise.all(
      Array.from({ length: CONCURRENT_FLUSHES }, () =>
        flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW, batchSize: 1 }),
      ),
    );

    const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.newValue).toMatchObject({ attempt: "redeem", count: 16 });
    await expect(db.select().from(recoveryRejectedAttemptAccumulator)).resolves.toEqual([]);
  });

  it("makes an overlapping flush wait for the one in progress before it touches any accumulated row", async () => {
    const email = `margaret-${randomUUID()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ firstName: "Margaret Hamilton", email })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(recoveryRejectedAttemptAccumulator).values({
      kind: "request",
      keyHash: hashDestinationAddress(email),
      windowStart: WINDOW_START,
      count: 2,
      firstAt: new Date("2026-01-05T12:05:00.000Z"),
      lastAt: new Date("2026-01-05T12:50:00.000Z"),
    });
    const holder = connectAs("audit-log-holder");
    const firstFlusher = connectAs("first-flush");
    const secondFlusher = connectAs("second-flush");
    let releaseAuditLog = () => {};
    const auditLogReleased = new Promise<void>((resolve) => {
      releaseAuditLog = resolve;
    });
    let auditLogHeld = () => {};
    const auditLogLocked = new Promise<void>((resolve) => {
      auditLogHeld = resolve;
    });
    let firstFlush: Promise<number> | undefined;
    let secondFlush: Promise<number> | undefined;
    try {
      // Holding audit_log stalls the first flush right before it writes, with its rows taken.
      const holding = holder.begin(async (tx) => {
        await tx`lock table audit_log in share mode`;
        auditLogHeld();
        await auditLogReleased;
      });
      await auditLogLocked;
      firstFlush = flushClosedRecoveryRejectedAttemptWindows(drizzle(firstFlusher), {
        now: () => CLOSED_NOW,
      });
      // Closing the clients below always settles these, whether or not they are awaited first; a
      // failure between here and that await would otherwise reject them with nothing attached,
      // and vitest would report that on top of whatever assertion actually failed.
      firstFlush.catch(() => {});
      await waitUntilBlockedOnALock("first-flush");
      secondFlush = flushClosedRecoveryRejectedAttemptWindows(drizzle(secondFlusher), {
        now: () => CLOSED_NOW,
      });
      secondFlush.catch(() => {});
      await waitUntilBlockedOnALock("second-flush");

      const accumulatorLocksOfTheSecondFlush = await sql`
        select 1 from pg_locks
        join pg_stat_activity using (pid)
        where application_name = 'second-flush'
          and relation = 'recovery_rejected_attempt_accumulator'::regclass
      `;
      releaseAuditLog();
      await holding;
      const outcomes = await Promise.all([firstFlush, secondFlush]);

      expect(accumulatorLocksOfTheSecondFlush).toHaveLength(0);
      expect(outcomes).toEqual([1, 0]);
      const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id));
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]?.newValue).toMatchObject({ count: 2 });
    } finally {
      releaseAuditLog();
      await Promise.allSettled([firstFlush, secondFlush]);
      await Promise.all(
        [holder, firstFlusher, secondFlusher].map((client) => client.end({ timeout: 1 })),
      );
    }
  });

  it("flushes more closed rows than one statement could ever bind as parameters", async () => {
    const email = `linus-${randomUUID()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ firstName: "Linus", email })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(recoveryRejectedAttemptAccumulator).values({
      kind: "request",
      keyHash: hashDestinationAddress(email),
      windowStart: WINDOW_START,
      count: 1,
      firstAt: new Date("2026-01-05T12:05:00.000Z"),
      lastAt: new Date("2026-01-05T12:05:00.000Z"),
    });
    // Random destination addresses a flood could make up, none of them belonging to an account.
    const windowStart = WINDOW_START.toISOString();
    await sql`
      insert into recovery_rejected_attempt_accumulator
        (kind, key_hash, window_start, count, first_at, last_at)
      select 'request', md5(n::text), ${windowStart}::timestamptz, 1,
        ${windowStart}::timestamptz, ${windowStart}::timestamptz
      from generate_series(1, ${UNBOUNDED_KEY_COUNT}) as n
    `;

    const flushed = await flushClosedRecoveryRejectedAttemptWindows(db, { now: () => CLOSED_NOW });

    expect(flushed).toBe(UNBOUNDED_KEY_COUNT + 1);
    const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id));
    expect(auditRows).toHaveLength(1);
    await expect(db.select().from(recoveryRejectedAttemptAccumulator)).resolves.toEqual([]);
  });
});
