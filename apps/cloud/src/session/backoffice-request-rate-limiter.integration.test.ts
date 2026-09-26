import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import {
  BACKOFFICE_SESSION_LIMIT_PER_HOUR,
  BACKOFFICE_SOURCE_ADDRESS_LIMIT_PER_HOUR,
  recordBackofficeRequest,
} from "./backoffice-request-rate-limiter.js";

// PGlite serves every query on one connection, so only a real Postgres pool can race two
// requests for the last slot of the same limit.
let integrationDb: IntegrationDatabase;
let sql: postgres.Sql;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("backoffice_rate_limiter");
  sql = postgres(integrationDb.databaseUrl, { max: 20 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");
const POLL_INTERVAL_MS = 50;

function connectAs(applicationName: string): ReturnType<typeof postgres> {
  return postgres(integrationDb.databaseUrl, {
    max: 1,
    connection: { application_name: applicationName },
  });
}

/**
 * Resolves "held up" once the named backend is observed waiting on an advisory lock, or never
 * resolves once `isDone` reports the race's other side already settled — so this side of the
 * race stops polling instead of running for as long as the test does.
 */
async function waitUntilBlockedOnAnAdvisoryLock(
  applicationName: string,
  isDone: () => boolean,
): Promise<"held up"> {
  while (!isDone()) {
    const [row] = await sql<{ blocked: boolean }[]>`
      select exists (
        select 1 from pg_stat_activity
        where application_name = ${applicationName}
          and wait_event_type = 'Lock'
          and wait_event = 'advisory'
      ) as blocked
    `;
    if (row?.blocked) {
      return "held up";
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return await new Promise<"held up">(() => {});
}

/** Seeds `count` already-admitted rows for one key, directly, so a race only needs to contend for the few slots left under its limit. */
async function seedAttempts(
  keyKind: "session" | "source_address",
  keyValue: string,
  count: number,
) {
  for (let batch = 0; batch < count; batch += 500) {
    const size = Math.min(500, count - batch);
    await sql`
      insert into backoffice_rate_limit_attempts (key_kind, key_value, attempted_at)
      select ${keyKind}, ${keyValue}, ${NOON.toISOString()}::timestamptz
      from generate_series(1, ${size})
    `;
  }
}

describe("the backoffice rate limiter on concurrent connections", () => {
  it("admits exactly 5 of 20 concurrent requests once a session is 5 requests under its limit", async () => {
    const db = drizzle(sql);
    await seedAttempts("session", "concurrent-session", BACKOFFICE_SESSION_LIMIT_PER_HOUR - 5);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordBackofficeRequest(db, {
          sessionKeyValue: "concurrent-session",
          sourceAddress: `198.51.100.${i}`,
          now: NOON,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it("admits exactly 5 of 20 concurrent requests once a source address is 5 requests under its limit", async () => {
    const db = drizzle(sql);
    await seedAttempts(
      "source_address",
      "198.51.100.200",
      BACKOFFICE_SOURCE_ADDRESS_LIMIT_PER_HOUR - 5,
    );

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordBackofficeRequest(db, {
          sessionKeyValue: `concurrent-session-${i}`,
          sourceAddress: "198.51.100.200",
          now: NOON,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it("is not held up while the recovery limiter holds its own lock for the same source address", async () => {
    const requestConnection = connectAs("backoffice-request");
    const requestDb = drizzle(requestConnection);
    let recoveryLockTaken!: () => void;
    const recoveryLockHeld = new Promise<void>((resolve) => {
      recoveryLockTaken = resolve;
    });
    let releaseRecoveryLock!: () => void;
    const recoveryLockReleased = new Promise<void>((resolve) => {
      releaseRecoveryLock = resolve;
    });
    // The recovery limiter locks each of its keys as `<key kind>:<key value>`.
    const recoveryTransaction = sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${"source_address:198.51.100.77"}, 0))`;
      recoveryLockTaken();
      await recoveryLockReleased;
    });
    await recoveryLockHeld;

    try {
      let requestSettled = false;
      const request = recordBackofficeRequest(requestDb, {
        sessionKeyValue: "unrelated-session",
        sourceAddress: "198.51.100.77",
        now: NOON,
      }).finally(() => {
        requestSettled = true;
      });

      const outcome = await Promise.race([
        request.then(() => "completed" as const),
        waitUntilBlockedOnAnAdvisoryLock("backoffice-request", () => requestSettled),
      ]);
      releaseRecoveryLock();
      await recoveryTransaction;
      await request;

      expect(outcome).toBe("completed");
    } finally {
      await requestConnection.end({ timeout: 1 });
    }
  });
});
