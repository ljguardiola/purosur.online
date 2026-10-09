import {
  RECOVERY_DESTINATION_ADDRESS_LIMIT,
  RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT,
} from "@purosur/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
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
  it("admits only the destination address's limit out of 20 concurrent requests for it", async () => {
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

    expect(results.filter((result) => result.allowed)).toHaveLength(
      RECOVERY_DESTINATION_ADDRESS_LIMIT,
    );
  });

  it("admits only the source address's limit out of 20 concurrent redemption attempts from it", async () => {
    const db = drizzle(sql);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        recordRedemptionAttempt(db, { sourceAddress: "198.51.100.200", now: NOON }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(
      RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT,
    );
  });
});
