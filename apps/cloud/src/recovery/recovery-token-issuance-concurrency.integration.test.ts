import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recoveryTokens, users } from "../db/schema.js";
import { processRecoveryRequestJob } from "./process-recovery-request-job.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";

// PGlite runs every query over one connection, so it can never race two jobs for the same account.
// This runs them over a real postgres-js pool of more than one connection against a real Postgres.
const CONCURRENT_REQUESTS = 8;
const BASE_REQUESTED_AT = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_token_issuance_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: CONCURRENT_REQUESTS });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("recovery-request jobs for the same account running concurrently against a real pool", () => {
  it("all complete and leave exactly one live link, the one issued for the newest request", async () => {
    const email = `ada-${randomUUID()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    const requestTimes = Array.from(
      { length: CONCURRENT_REQUESTS },
      (_, index) => new Date(BASE_REQUESTED_AT.getTime() + index * 1000),
    );

    const outcomes = await Promise.allSettled(
      requestTimes.map((requestedAt) =>
        processRecoveryRequestJob(
          db,
          {
            email,
            requestedAt: requestedAt.toISOString(),
            requestId: randomUUID(),
          },
          {
            now: () => new Date(),
            backofficeOrigin: "https://staging.purosur.online",
          },
        ),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([]);
    const liveTokens = await db
      .select({ requestedAt: recoveryTokens.requestedAt })
      .from(recoveryTokens)
      .where(
        and(
          eq(recoveryTokens.userId, user.id),
          isNull(recoveryTokens.usedAt),
          isNull(recoveryTokens.voidedAt),
        ),
      );
    expect(liveTokens).toEqual([{ requestedAt: requestTimes[CONCURRENT_REQUESTS - 1] }]);
  });
});
