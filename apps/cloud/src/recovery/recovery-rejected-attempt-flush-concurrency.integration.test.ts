import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, recoveryRejectedAttemptAccumulator, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";

// `flushClosedRecoveryRejectedAttemptWindows` relies on `FOR UPDATE SKIP LOCKED` to make two
// overlapping flushes safe. PGlite serializes every query over a single connection and can never
// race for real, so this proves it against a real Postgres with a real pool of more than one
// connection, running two flushes genuinely in parallel over the same closed window.
const CONCURRENT_FLUSHES = 4;
const WINDOW_START = new Date("2026-01-05T12:00:00.000Z");
const CLOSED_NOW = new Date("2026-01-05T13:05:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_rejected_attempt_flush_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: CONCURRENT_FLUSHES });
  db = drizzle(sql);
}, 60_000);

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
});
