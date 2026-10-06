import { canonicalOutboxEvent, type PushedEvent, type RegisterTelemetry } from "@purosur/domain";
import { receivePushedEvents } from "@purosur/domain/sync/use-cases";
import { count, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deviceState, inbox, refusedEvents, registerInstallations } from "../platform/db/schema.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { insertEnrolledInstallation as enrollInstallation } from "../register/test-support/enrolled-installation.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { DrizzleInbox } from "./drizzle-inbox.js";
import { hmacEventChain } from "./hmac-event-chain.js";

const CIPHER = installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY);

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

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");

function linked(...events: PushedEvent[]): PushedEvent[] {
  let link: string | null = null;
  return events.map(({ chain_hmac: _unlinked, ...unlinked }) => {
    link = hmacEventChain.link(CHAIN_KEY, link, canonicalOutboxEvent(unlinked));
    return { ...unlinked, chain_hmac: link };
  });
}

let registerCount = 0;

function insertEnrolledInstallation() {
  registerCount += 1;
  return enrollInstallation(db, {
    registerName: `Caja ${registerCount}`,
    outboxChainKey: CHAIN_KEY,
  });
}

function push(deviceId: string, events: PushedEvent[]) {
  return receivePushedEvents(
    { inbox: new DrizzleInbox(db, CIPHER), eventChain: hmacEventChain, clock: { now: () => NOW } },
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
    const [pushed = event(1)] = linked(event(1));

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
      chainHmac: pushed.chain_hmac,
      receivedAt: NOW,
    });
  });

  it("reads the seqs it holds for one installation only", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();
    await db
      .insert(inbox)
      .values([event(4), event(1), event(2)].map((pushed) => storedRow(first.deviceId, pushed)));
    await db.insert(inbox).values(storedRow(second.deviceId, event(3)));

    const seqs = await new DrizzleInbox(db, CIPHER).transaction((tx) =>
      tx.receivedDeviceSeqs(first.deviceId),
    );

    expect([...seqs].sort((a, b) => a - b)).toEqual([1, 2, 4]);
  });

  it("acknowledges what a push fills in after a hole it left behind", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const [first, second, third, fourth] = linked(event(1), event(2), event(3), event(4));
    if (!first || !second || !third || !fourth) {
      throw new Error("test setup: the chain holds four events");
    }
    await db
      .insert(inbox)
      .values([first, second, fourth].map((pushed) => storedRow(deviceId, pushed)));

    expect(await push(deviceId, [third])).toEqual({ kind: "received", ackSeq: 4 });
  });

  it("keeps the events of each installation apart", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();

    await push(first.deviceId, linked(event(1), event(2)));
    const outcome = await push(second.deviceId, linked(event(1)));

    expect(outcome).toEqual({ kind: "received", ackSeq: 1 });
    expect(await storedSeqs(first.deviceId)).toEqual([1, 2]);
  });

  it("records the push report of an installation that has never pulled", async () => {
    const { deviceId } = await insertEnrolledInstallation();

    await push(deviceId, linked(event(1)));

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
    const events = linked(event(1), event(2), event(3));

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

  it("keeps a push with a broken chain aside and revokes its installation", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const forged = { ...event(1), chain_hmac: "forged-link" };

    expect(await push(deviceId, [forged])).toEqual({ kind: "chain_broken" });

    expect(await storedSeqs(deviceId)).toEqual([]);
    const kept = await db.select().from(refusedEvents).where(eq(refusedEvents.deviceId, deviceId));
    expect(kept.map((row) => [row.eventId, row.chainHmac])).toEqual([
      [forged.event_id, "forged-link"],
    ]);
    const [installation] = await db
      .select({ revocationReason: registerInstallations.revocationReason })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(installation?.revocationReason).toBe("outbox_chain_broken");
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
