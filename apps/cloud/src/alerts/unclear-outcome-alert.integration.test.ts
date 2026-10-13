import { openOverdueUnclearOutcomeAlerts } from "@purosur/domain/alerts/use-cases";
import { decideUnclearRealTimeOutcome } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DrizzleUnclearOutcomeLanes,
  DrizzleUnclearOutcomeRequests,
} from "../fiscal/drizzle-unclear-outcome-lanes.js";
import {
  anUnclearDocument,
  UNCLEAR_SINCE,
} from "../fiscal/test-support/unclear-document-fixtures.js";
import { alerts } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleUnclearOutcomeAlertStore } from "./drizzle-unclear-outcome-alert-store.js";

const MINUTE_MS = 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("unclear_outcome_alert");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

function minutesAfterUnclear(minutes: number): Date {
  return new Date(UNCLEAR_SINCE.getTime() + minutes * MINUTE_MS);
}

function openOverdueAlerts(now: Date) {
  return openOverdueUnclearOutcomeAlerts({
    store: new DrizzleUnclearOutcomeAlertStore(db),
    clock: { now: () => now },
  });
}

function decide(fiscalDocumentId: string, now: Date) {
  const unavailable = async () => {
    throw new Error("the tax authority is not asked about a document recorded as not attempted");
  };
  return decideUnclearRealTimeOutcome(
    {
      requests: new DrizzleUnclearOutcomeRequests(db),
      lanes: new DrizzleUnclearOutcomeLanes(postgresDedicatedConnections(sql), async () => {}),
      clock: { now: () => now },
      tokens: { validToken: unavailable },
      vouchers: { voucherAt: unavailable },
      taxAuthority: { lastAuthorized: unavailable },
    },
    { fiscalDocumentId },
  );
}

function alertsOf(fiscalDocumentId: string) {
  return db.select().from(alerts).where(eq(alerts.scope, fiscalDocumentId));
}

describe("the alert of a document left unclear on a real Postgres", () => {
  it("resolves the alert of a document decided while the job was opening it", async () => {
    const document = await anUnclearDocument(db, { answer: "not_attempted" });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let announceOpened: () => void = () => {};
    const opened = new Promise<void>((resolve) => {
      announceOpened = resolve;
    });
    const job = new DrizzleUnclearOutcomeAlertStore(db).transaction(async (tx) => {
      const locked = await tx.lockUnclearDocumentsWithoutUnclearOutcomeAlert();
      for (const unclear of locked) {
        await tx.openUnclearOutcomeAlert(unclear, "warning", minutesAfterUnclear(6));
      }
      announceOpened();
      await gate;
    });
    await opened;
    const decidedAt = minutesAfterUnclear(7);

    const deciding = decide(document.fiscalDocumentId, decidedAt);
    await waitForLockWaiters(sql, 1);
    release();
    await job;
    await deciding;

    expect(await alertsOf(document.fiscalDocumentId)).toMatchObject([{ resolvedAt: decidedAt }]);
  });

  it("skips a document a decision is recording at that moment, opening no alert for it", async () => {
    const document = await anUnclearDocument(db, { answer: "not_attempted" });
    const holder = await sql.reserve();
    await holder`begin`;
    await holder`select 1 from fiscal_requests where fiscal_document_id = ${document.fiscalDocumentId} for update`;

    const outcome = await openOverdueAlerts(minutesAfterUnclear(6));
    await holder`rollback`;
    holder.release();

    expect(outcome.fiscalDocumentIds).not.toContain(document.fiscalDocumentId);
    expect(await alertsOf(document.fiscalDocumentId)).toEqual([]);
  });

  it("stores no decision when resolving the alert fails with it", async () => {
    const document = await anUnclearDocument(db, { answer: "not_attempted" });
    await openOverdueAlerts(minutesAfterUnclear(6));
    await admin`
      create function refuse_alert_resolution() returns trigger language plpgsql as $$
      begin
        raise exception 'the alert resolution broke';
      end;
      $$`;
    await admin`
      create trigger refuse_alert_resolution before update on alerts
      for each row execute function refuse_alert_resolution()`;

    try {
      await expect(decide(document.fiscalDocumentId, minutesAfterUnclear(7))).rejects.toThrow();
    } finally {
      await admin`drop trigger refuse_alert_resolution on alerts`;
      await admin`drop function refuse_alert_resolution()`;
    }

    expect(
      await sql`select decision, decided_at from fiscal_requests where fiscal_document_id = ${document.fiscalDocumentId}`,
    ).toEqual([{ decision: null, decided_at: null }]);
    expect(await alertsOf(document.fiscalDocumentId)).toMatchObject([{ resolvedAt: null }]);
  });
});
