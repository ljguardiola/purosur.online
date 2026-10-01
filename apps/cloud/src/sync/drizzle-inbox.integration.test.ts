import type { PushedEvent, RegisterTelemetry } from "@purosur/domain";
import { receivePushedEvents } from "@purosur/domain/sync/use-cases";
import { count, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deviceState, inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation as enrollInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleInbox } from "./drizzle-inbox.js";

// PGlite runs every query over one connection, so two pushes can never overlap there, and it has
// no roles to show which privileges the inbox needs.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("drizzle_inbox");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOW = new Date("2026-10-01T09:30:00.000Z");
const TELEMETRY: RegisterTelemetry = {
  wal_size_bytes: 4096,
  disk_free_bytes: 50_000_000,
  disk_free_ratio: 0.42,
};

function event(deviceSeq: number, eventId: string = crypto.randomUUID()): PushedEvent {
  return {
    event_id: eventId,
    device_seq: deviceSeq,
    aggregate_type: "sale",
    aggregate_id: "sale-1",
    event_type: "sale_line_added",
    schema_version: 1,
    payload: { quantity: 2, note: null, tags: ["a", "b"] },
    occurred_at: "2026-10-01T09:00:00.000Z",
    actor_id: "user-1",
    chain_hmac: "hmac",
  };
}

let registerCount = 0;

function insertEnrolledInstallation() {
  registerCount += 1;
  return enrollInstallation(db, { registerName: `Caja ${registerCount}` });
}

function push(deviceId: string, events: PushedEvent[]) {
  return receivePushedEvents(
    { inbox: new DrizzleInbox(db), clock: { now: () => NOW } },
    { deviceId, appVersion: "1.4.0", telemetry: TELEMETRY, events },
  );
}

async function storedSeqs(deviceId: string): Promise<number[]> {
  const rows = await db
    .select({ deviceSeq: inbox.deviceSeq })
    .from(inbox)
    .where(eq(inbox.deviceId, deviceId));
  return rows.map((row) => row.deviceSeq).sort((a, b) => a - b);
}

describe("the inbox on a real Postgres, as the role the deployed cloud connects with", () => {
  it("stores a pushed event whole and acknowledges it", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const pushed = event(1);

    expect(await push(deviceId, [pushed])).toEqual({ kind: "received", ackSeq: 1 });

    const [stored] = await db.select().from(inbox).where(eq(inbox.deviceId, deviceId));
    expect(stored).toEqual({
      eventId: pushed.event_id,
      deviceId,
      deviceSeq: 1,
      aggregateType: "sale",
      aggregateId: "sale-1",
      eventType: "sale_line_added",
      schemaVersion: 1,
      payload: { quantity: 2, note: null, tags: ["a", "b"] },
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
      actorId: "user-1",
      chainHmac: "hmac",
      receivedAt: NOW,
    });
  });

  it("answers the highest contiguous seq, not the highest stored one, when a hole sits between", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const stored = [event(1), event(2), event(4)];
    await db.insert(inbox).values(stored.map((pushed) => storedRow(deviceId, pushed)));

    const outcome = await push(deviceId, [event(1, stored[0]?.event_id)]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 2 });
  });

  it("counts on from the stored events once a push fills the hole", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const stored = [event(1), event(2), event(4)];
    await db.insert(inbox).values(stored.map((pushed) => storedRow(deviceId, pushed)));

    const outcome = await push(deviceId, [event(3)]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 4 });
  });

  it("acknowledges nothing while the first seq is missing, however many are stored", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    await db
      .insert(inbox)
      .values([event(2), event(3)].map((pushed) => storedRow(deviceId, pushed)));

    const outcome = await push(deviceId, [event(4)]);

    expect(outcome).toEqual({ kind: "gap", ackSeq: 0, expectedSeq: 1 });
  });

  it("keeps the events of each installation apart", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();

    await push(first.deviceId, [event(1), event(2)]);
    const outcome = await push(second.deviceId, [event(1)]);

    expect(outcome).toEqual({ kind: "received", ackSeq: 1 });
    expect(await storedSeqs(first.deviceId)).toEqual([1, 2]);
  });

  it("records the push report of an installation that has never pulled", async () => {
    const { deviceId } = await insertEnrolledInstallation();

    await push(deviceId, [event(1)]);

    expect(await db.select().from(deviceState).where(eq(deviceState.deviceId, deviceId))).toEqual([
      {
        deviceId,
        lastPullSince: null,
        lastPulledAt: null,
        appVersion: "1.4.0",
        lastPushedAt: NOW,
        walSizeBytes: 4096,
        diskFreeBytes: 50_000_000,
        diskFreeRatio: 0.42,
      },
    ]);
  });

  it("serializes two pushes of one installation, so both end consistent", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const events = [event(1), event(2), event(3)];

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select id from register_installations where id = ${deviceId} for no key update`,
      () => push(deviceId, events),
      () => push(deviceId, events),
    );

    expect(first).toEqual({ kind: "received", ackSeq: 3 });
    expect(second).toEqual({ kind: "received", ackSeq: 3 });
    const [{ stored } = { stored: 0 }] = await db
      .select({ stored: count() })
      .from(inbox)
      .where(eq(inbox.deviceId, deviceId));
    expect(stored).toBe(3);
  });
});

function storedRow(deviceId: string, pushed: PushedEvent): typeof inbox.$inferInsert {
  return {
    eventId: pushed.event_id,
    deviceId,
    deviceSeq: pushed.device_seq,
    aggregateType: pushed.aggregate_type,
    aggregateId: pushed.aggregate_id,
    eventType: pushed.event_type,
    schemaVersion: pushed.schema_version,
    payload: pushed.payload,
    occurredAt: new Date(pushed.occurred_at),
    actorId: pushed.actor_id,
    chainHmac: pushed.chain_hmac,
    receivedAt: NOW,
  };
}
