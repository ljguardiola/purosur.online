import { recordExceptionShareBreaches } from "@purosur/domain/fiscal/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exceptionShareBreaches } from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import {
  DrizzleExceptionShareBreachStore,
  EXCEPTION_SHARE_BREACH_LOCK_KEY,
} from "./drizzle-exception-share-breach-store.js";
import {
  insertFiscalAddress,
  insertRegisterAtFiscalAddress,
} from "./test-support/exception-share-fixtures.js";
import {
  insertCaeaDocument,
  insertReceiptRequest,
} from "./test-support/issued-document-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("exception_share_breach_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two recordings of the exception share breaches at once, on a real Postgres", () => {
  it("records the breach once and leaves the second recording with nothing to do", async () => {
    const fiscalAddressId = await insertFiscalAddress(db, "Depósito Central");
    const registerId = await insertRegisterAtFiscalAddress(db, fiscalAddressId, "Caja 1");
    await insertCaeaDocument(db, registerId, { issuedOn: "2026-09-12" });
    await insertReceiptRequest(db, registerId, { issuedOn: "2026-09-13" });
    const record = () =>
      recordExceptionShareBreaches({
        store: new DrizzleExceptionShareBreachStore(db, () => NOW),
        clock: { now: () => NOW },
        zoneRules: fixedZoneRulesSource(),
      });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select pg_advisory_xact_lock(hashtextextended(${EXCEPTION_SHARE_BREACH_LOCK_KEY}, 0))`,
      record,
      record,
    );

    expect(outcomes).toEqual([
      { kind: "recorded", recorded: 1, updated: 0 },
      { kind: "recorded", recorded: 0, updated: 0 },
    ]);
    expect(await db.select().from(exceptionShareBreaches)).toHaveLength(1);
  });
});
