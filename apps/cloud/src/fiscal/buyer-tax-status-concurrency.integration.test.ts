import { recordBuyerTaxStatusSet } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
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

const OPTION_A = { code: 901, description: "Condicion de prueba A", invoiceClass: "A" };
const OPTION_B = { code: 902, description: "Condicion de prueba B", invoiceClass: "C" };

// PGlite serializes all transactions on one connection, so only a real Postgres pool can
// interleave two recordings; an empty table has no row to lock, so each test holds the store's
// own lock and waits for both recordings to queue behind it.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("buyer_tax_status_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function holdAdvisoryLock(key: string) {
  return (holder: postgres.ReservedSql) =>
    holder`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

describe("two buyer tax-status sets recorded at once on an empty table, on a real Postgres", () => {
  it("gives different sets the versions one and two, in the order they queued", async () => {
    const record = (options: (typeof OPTION_A)[]) => () =>
      recordBuyerTaxStatusSet({ store: new DrizzleBuyerTaxStatusStore(db) }, { options });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      holdAdvisoryLock(BUYER_TAX_STATUS_SET_LOCK_KEY),
      record([OPTION_A]),
      record([OPTION_A, OPTION_B]),
    );

    expect(outcomes).toEqual([
      { kind: "recorded", paramsVersion: 1 },
      { kind: "recorded", paramsVersion: 2 },
    ]);
    const stored = await db
      .select({ paramsVersion: buyerTaxStatusSets.paramsVersion })
      .from(buyerTaxStatusSets)
      .orderBy(asc(buyerTaxStatusSets.paramsVersion));
    expect(stored).toEqual([{ paramsVersion: 1 }, { paramsVersion: 2 }]);
  });
});
