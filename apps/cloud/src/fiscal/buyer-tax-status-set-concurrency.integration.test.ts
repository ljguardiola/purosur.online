import { recordBuyerTaxStatusSet } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buyerTaxStatusSets } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import {
  BUYER_TAX_STATUS_SET_LOCK_KEY,
  DrizzleBuyerTaxStatusStore,
} from "./drizzle-buyer-tax-status-store.js";

const fetched = [{ code: 901, description: "Condicion de prueba A", invoiceClass: "A" }];

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("buyer_tax_status_set_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the same new set recorded twice at once, on a real Postgres", () => {
  it("records it once and finds it unchanged the second time", async () => {
    const record = () =>
      recordBuyerTaxStatusSet({ store: new DrizzleBuyerTaxStatusStore(db) }, { options: fetched });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${BUYER_TAX_STATUS_SET_LOCK_KEY}, 0))`,
      record,
      record,
    );

    expect(outcomes).toEqual([
      { kind: "recorded", paramsVersion: 1 },
      { kind: "unchanged", paramsVersion: 1 },
    ]);
    expect(await db.select().from(buyerTaxStatusSets)).toHaveLength(1);
  });
});
