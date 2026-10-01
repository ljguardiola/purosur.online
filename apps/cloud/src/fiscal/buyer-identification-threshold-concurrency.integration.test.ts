import { randomUUID } from "node:crypto";
import { recordBuyerIdentificationThreshold } from "@purosur/domain/fiscal/use-cases";
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

describe("two thresholds recorded at once on top of the installed one, on a real Postgres", () => {
  it("records exactly one of them and refuses the other as not starting after it", async () => {
    const actorId = await insertActor();
    const record = () =>
      recordBuyerIdentificationThreshold(
        { store: new DrizzleBuyerIdentificationThresholdStore(db) },
        { amount: 1_000_000, validFrom: "2026-10-01", actorId },
      );

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      holdAdvisoryLock(BUYER_IDENTIFICATION_THRESHOLD_LOCK_KEY),
      record,
      record,
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["recorded", "not_after_latest"]);
    expect(await db.select().from(buyerIdentificationThresholds)).toHaveLength(2);
  });
});
