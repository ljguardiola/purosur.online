import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { recordBackofficeRequest } from "./backoffice-request-rate-limiter.js";

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
const SESSION_LIMIT_PER_HOUR = 600;
const SOURCE_ADDRESS_LIMIT_PER_HOUR = 1800;

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
    await seedAttempts("session", "concurrent-session", SESSION_LIMIT_PER_HOUR - 5);

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
    await seedAttempts("source_address", "198.51.100.200", SOURCE_ADDRESS_LIMIT_PER_HOUR - 5);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        recordBackofficeRequest(db, { sourceAddress: "198.51.100.200", now: NOON }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });
});
