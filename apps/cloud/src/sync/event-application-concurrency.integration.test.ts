import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cashSessions, inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
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

async function sessionsOf(sessionId: string) {
  return db.select().from(cashSessions).where(eq(cashSessions.id, sessionId));
}

describe("applying events on a real Postgres", () => {
  it("lets two appliers meet on the same aggregate without applying its event twice", async () => {
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: randomUUID(),
    });
    const sessionId = await insertOpeningOf(deviceId, new Date("2026-10-06T11:00:05.000Z"));

    const outcomes = await Promise.all([applier(), applier()]);

    const appliedByRuns = outcomes.reduce(
      (total, outcome) => total + (outcome.kind === "processed" ? outcome.applied : 0),
      0,
    );
    expect(appliedByRuns).toBe(1);
    expect(await sessionsOf(sessionId)).toHaveLength(1);
    const [event] = await db.select().from(inbox).where(eq(inbox.aggregateId, sessionId));
    expect(event).toMatchObject({ appliedAt: NOW, attempts: 0 });
  }, 30_000);

  it("skips an aggregate another session holds without waiting, applies the others and picks it up once released", async () => {
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: randomUUID(),
    });
    const older = await insertOpeningOf(deviceId, new Date("2026-10-06T12:00:05.000Z"));
    const held = await insertOpeningOf(deviceId, new Date("2026-10-06T12:00:10.000Z"));
    const newer = await insertOpeningOf(deviceId, new Date("2026-10-06T12:00:15.000Z"));
    const holder = await sql.reserve();
    try {
      await holder`begin`;
      await holdAggregateLock(holder, held);

      const whileHeld = await applier();

      expect(whileHeld).toMatchObject({ kind: "processed", applied: 2, busy: 1 });
      expect(await sessionsOf(older)).toHaveLength(1);
      expect(await sessionsOf(newer)).toHaveLength(1);
      expect(await sessionsOf(held)).toEqual([]);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    const afterRelease = await applier();

    expect(afterRelease).toMatchObject({ kind: "processed", applied: 1, busy: 0 });
    expect(await sessionsOf(held)).toHaveLength(1);
    expect(await applier()).toEqual({ kind: "idle" });
  }, 30_000);
});
