import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recoveryRejectedAttemptAccumulator } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";
import { recordRejectedAttempt } from "./recovery-rejected-attempt-accumulator.js";

// PGlite serializes every query over a single connection, so only a real Postgres with a pool of
// several connections can race many upserts of the same key against each other for real.
const POOL_SIZE = 8;
const CONCURRENT_ATTEMPTS = 60;
const WINDOW_START_MS = new Date("2026-01-05T12:00:00.000Z").getTime();

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_rejected_attempt_accumulator");
  sql = postgres(integrationDb.databaseUrl, { max: POOL_SIZE });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("recordRejectedAttempt against a real pool", () => {
  it("counts every concurrent attempt on one key and keeps the earliest and latest time, whatever order they land in", async () => {
    // Spread across the hour and interleaved, so the latest attempts are not the last to land.
    const attemptTimes = Array.from(
      { length: CONCURRENT_ATTEMPTS },
      (_, i) => new Date(WINDOW_START_MS + ((i * 37) % CONCURRENT_ATTEMPTS) * 60_000 + 1_000),
    );

    await Promise.all(
      attemptTimes.map((now) =>
        recordRejectedAttempt(db, { kind: "redeem", keyHash: "hash-raced", now }),
      ),
    );

    const stored = await db
      .select()
      .from(recoveryRejectedAttemptAccumulator)
      .where(eq(recoveryRejectedAttemptAccumulator.keyHash, "hash-raced"));
    const times = attemptTimes.map((time) => time.getTime());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      count: CONCURRENT_ATTEMPTS,
      firstAt: new Date(Math.min(...times)),
      lastAt: new Date(Math.max(...times)),
    });
  });
});
