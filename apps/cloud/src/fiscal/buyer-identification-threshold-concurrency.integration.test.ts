import { randomUUID } from "node:crypto";
import { recordBuyerIdentificationThreshold } from "@purosur/domain/fiscal/use-cases";
import { asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buyerIdentificationThresholds, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY,
  DrizzleBuyerIdentificationThresholdStore,
} from "./drizzle-buyer-identification-threshold-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("buyer_threshold_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function insertActor(): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

function holdAdvisoryLock(key: string) {
  return (holder: postgres.ReservedSql) =>
    holder`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

describe("two thresholds recorded at once for the same day, on a real Postgres", () => {
  it("records both, the second as the replacement of the first", async () => {
    const actorId = await insertActor();
    const record = (amount: number) => () =>
      recordBuyerIdentificationThreshold(
        {
          store: new DrizzleBuyerIdentificationThresholdStore(db, () => NOON),
          clock: { now: () => NOON },
        },
        { amount, validFrom: "2026-10-01", actorId, confirmedLowerThanInEffect: false },
      );

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      holdAdvisoryLock(BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY),
      record(2_000_000_000),
      record(3_000_000_000),
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["recorded", "recorded"]);
    const stored = await db
      .select()
      .from(buyerIdentificationThresholds)
      .where(eq(buyerIdentificationThresholds.validFrom, "2026-10-01"))
      .orderBy(asc(buyerIdentificationThresholds.revision));
    expect(stored.map(({ amount, revision }) => [amount, revision])).toEqual([
      [2_000_000_000, 0],
      [3_000_000_000, 1],
    ]);
  });
});
