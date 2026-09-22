import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";
import { recordRecoveryRequestAttempt, recordRedemptionAttempt } from "./recovery-rate-limiter.js";

// PGlite serves every query on one connection, so only a real Postgres pool can race two
// attempts for the last slot of the same limit.
let integrationDb: IntegrationDatabase;
let sql: postgres.Sql;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_rate_limiter");
  sql = postgres(integrationDb.databaseUrl, { max: 20 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");

describe("the recovery rate limiter on concurrent connections", () => {
  it("admits exactly 5 of 20 concurrent requests for the same destination address", async () => {
    const db = drizzle(sql);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordRecoveryRequestAttempt(db, {
          destinationAddress: "concurrent@example.com",
          sourceAddress: `198.51.100.${i}`,
          now: NOON,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });

  it("admits exactly 10 of 20 concurrent redemption attempts from the same source address", async () => {
    const db = drizzle(sql);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        recordRedemptionAttempt(db, { sourceAddress: "198.51.100.200", now: NOON }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
  });
});
