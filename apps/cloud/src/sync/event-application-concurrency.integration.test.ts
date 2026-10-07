import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cashSessions, inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { DrizzleEventApplication } from "./drizzle-event-application.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

// PGlite serves every query on one connection, so these races need a real Postgres.
const NOW = new Date("2026-10-06T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("event_application_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function applier() {
  return applyPendingEvents(
    {
      eventApplication: new DrizzleEventApplication(db, () => NOW),
      upcaster: syncedEventUpcaster,
      clock: { now: () => NOW },
    },
    { limit: 10 },
  );
}

function holdAggregateLock(holder: postgres.ReservedSql, aggregateId: string) {
  return holder`select pg_advisory_xact_lock(
    hashtextextended(json_build_array('CashSession'::text, ${aggregateId}::text)::text, 0))`;
}

async function insertOpeningOf(deviceId: string, receivedAt: Date): Promise<string> {
  const sessionId = randomUUID();
  await insertInboxEvent(db, deviceId, {
    aggregateType: "CashSession",
    aggregateId: sessionId,
    eventType: "cash_session_opened",
    schemaVersion: 1,
    payload: {
      opened_by: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      opened_at: "2026-10-06T11:00:00.000Z",
      opening_float: 10000,
    },
    receivedAt,
  });
  return sessionId;
}

describe("applying events on a real Postgres", () => {
  it("lets two appliers meet on the same aggregate without applying its event twice", async () => {
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: randomUUID(),
    });
    const sessionId = await insertOpeningOf(deviceId, new Date("2026-10-06T11:00:05.000Z"));

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holdAggregateLock(holder, sessionId),
      applier,
      applier,
    );

    expect([first.kind, second.kind].sort()).toEqual(["idle", "processed"]);
    const opened = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId));
    expect(opened).toHaveLength(1);
    const [event] = await db.select().from(inbox).where(eq(inbox.aggregateId, sessionId));
    expect(event).toMatchObject({ appliedAt: NOW, attempts: 0 });
  }, 30_000);

  it("applies another aggregate while the lock of an older one is held", async () => {
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: randomUUID(),
    });
    const other = await insertOpeningOf(deviceId, new Date("2026-10-06T12:00:05.000Z"));
    const held = await insertOpeningOf(deviceId, new Date("2026-10-06T12:00:10.000Z"));
    const holder = await sql.reserve();
    let applying: ReturnType<typeof applier> | undefined;
    try {
      await holder`begin`;
      await holdAggregateLock(holder, held);
      applying = applier();
      applying.catch(() => {});
      await waitForLockWaiters(sql, 1);

      await vi.waitFor(async () => {
        const rows = await db.select().from(cashSessions).where(eq(cashSessions.id, other));
        expect(rows).toHaveLength(1);
      });
      const heldBefore = await db.select().from(cashSessions).where(eq(cashSessions.id, held));
      expect(heldBefore).toEqual([]);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    await applying;
    const heldAfter = await db.select().from(cashSessions).where(eq(cashSessions.id, held));
    expect(heldAfter).toHaveLength(1);
  }, 30_000);
});
