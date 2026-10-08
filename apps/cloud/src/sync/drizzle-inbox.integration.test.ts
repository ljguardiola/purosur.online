import { canonicalOutboxEvent, type PushedEvent, type RegisterTelemetry } from "@purosur/domain";
import { receivePushedEvents } from "@purosur/domain/sync/use-cases";
import { count, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  alerts,
  deviceState,
  inbox,
  refusedEvents,
  registerInstallations,
} from "../platform/db/schema.js";
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

// The database of this suite has no job queue.
const NO_JOB = async () => {};

let registerCount = 0;

function insertEnrolledInstallation() {
  registerCount += 1;
  return enrollInstallation(db, {
    now: NOW,
    registerName: `Caja ${registerCount}`,
    outboxChainKey: CHAIN_KEY,
  });
}

function push(deviceId: string, events: PushedEvent[], appVersion = "1.4.0") {
  return receivePushedEvents(
    {
      inbox: new DrizzleInbox(db, CIPHER, NO_JOB),
      eventChain: hmacEventChain,
      clock: { now: () => NOW },
    },
    { deviceId, appVersion, telemetry: TELEMETRY, events },
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
      appliedAt: null,
      attempts: 0,
      nextAttemptAt: null,
      quarantinedAt: null,
      lastError: null,
    });
  });

  it("reads the seqs it holds for one installation only", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();
    await db
      .insert(inbox)
      .values([event(4), event(1), event(2)].map((pushed) => storedRow(first.deviceId, pushed)));
    await db.insert(inbox).values(storedRow(second.deviceId, event(3)));

    const seqs = await new DrizzleInbox(db, CIPHER, NO_JOB).transaction((tx) =>
      tx.receivedDeviceSeqs(first.deviceId),
    );

    expect([...seqs].sort((a, b) => a - b)).toEqual([1, 2, 4]);
  });

  it("reads the event id and the link it holds at the seqs asked for, for one installation only", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();
    const [one = event(1), two = event(2)] = linked(event(1), event(2));
    await db.insert(inbox).values([one, two].map((pushed) => storedRow(first.deviceId, pushed)));
    await db.insert(inbox).values(storedRow(second.deviceId, event(2)));

    const held = await new DrizzleInbox(db, CIPHER, NO_JOB).transaction((tx) =>
      tx.receivedEventsAt(first.deviceId, [2, 3]),
    );

    expect(held).toEqual(new Map([[2, { eventId: two.event_id, chainHmac: two.chain_hmac }]]));
  });

  it("reads nothing for no seq", async () => {
    const { deviceId } = await insertEnrolledInstallation();

    const held = await new DrizzleInbox(db, CIPHER, NO_JOB).transaction((tx) =>
      tx.receivedEventsAt(deviceId, []),
    );

    expect(held).toEqual(new Map());
  });

  it("reads where it holds each event id asked for, whichever installation holds it", async () => {
    const first = await insertEnrolledInstallation();
    const second = await insertEnrolledInstallation();
    const pushed = [event(1), event(2), event(3)];
    await db.insert(inbox).values(storedRow(first.deviceId, pushed[0] ?? event(1)));
    await db.insert(inbox).values(storedRow(second.deviceId, pushed[1] ?? event(2)));

    const positions = await new DrizzleInbox(db, CIPHER, NO_JOB).transaction((tx) =>
      tx.receivedEventPositions(pushed.map((one) => one.event_id)),
    );

    expect(positions).toEqual(
      new Map([
        [pushed[0]?.event_id, { deviceId: first.deviceId, deviceSeq: 1 }],
        [pushed[1]?.event_id, { deviceId: second.deviceId, deviceSeq: 2 }],
      ]),
    );
  });

  it("reads no position for no event id", async () => {
    const positions = await new DrizzleInbox(db, CIPHER, NO_JOB).transaction((tx) =>
      tx.receivedEventPositions([]),
    );

    expect(positions).toEqual(new Map());
  });

  it("skips an event pushed again whole as it was stored, however the database returns its date and payload", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const [pushed = event(1)] = linked({
      ...event(1),
      occurred_at: "2026-10-01T09:00:00.123Z",
      payload: { z: 1, a: { y: [3, 2], x: null }, note: "ñ" },
    });
    await push(deviceId, [pushed]);

    expect(await push(deviceId, [pushed])).toEqual({ kind: "received", ackSeq: 1 });

    expect(await storedSeqs(deviceId)).toEqual([1]);
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
        lastAcceptedPushAt: NOW,
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

  it("answers revoked to a push queued behind the one whose chain broke, receiving nothing of it", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const forged = { ...event(1), chain_hmac: "forged-link" };

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select id from register_installations where id = ${deviceId} for no key update`,
      () => push(deviceId, [forged]),
      () => push(deviceId, linked(event(1))),
    );

    expect(first).toEqual({ kind: "chain_broken" });
    expect(second).toEqual({ kind: "revoked" });
    expect(await storedSeqs(deviceId)).toEqual([]);
  });

  it("keeps an earlier revocation and its reason when the chain breaks", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    const replacedAt = new Date("2026-09-30T08:00:00.000Z");
    await db
      .update(registerInstallations)
      .set({ revokedAt: replacedAt, revocationReason: "replaced" })
      .where(eq(registerInstallations.id, deviceId));

    await new DrizzleInbox(db, CIPHER, NO_JOB).transaction((tx) =>
      tx.revokeForBrokenChain(deviceId, NOW),
    );

    const [installation] = await db
      .select({
        revokedAt: registerInstallations.revokedAt,
        revocationReason: registerInstallations.revocationReason,
      })
      .from(registerInstallations)
      .where(eq(registerInstallations.id, deviceId));
    expect(installation).toEqual({ revokedAt: replacedAt, revocationReason: "replaced" });
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

describe("the inbox reporting how a register stands, on a real Postgres", () => {
  async function deviceStateOf(deviceId: string) {
    const [row] = await db.select().from(deviceState).where(eq(deviceState.deviceId, deviceId));
    return row;
  }

  it("records the moment of a push it received", async () => {
    const { deviceId } = await insertEnrolledInstallation();

    await push(deviceId, linked(event(1)));

    expect((await deviceStateOf(deviceId))?.lastAcceptedPushAt).toEqual(NOW);
  });

  it("leaves the moment of the last accepted push alone when it refuses a push", async () => {
    const { deviceId } = await insertEnrolledInstallation();
    await push(deviceId, linked(event(1)));
    const later = new Date(NOW.getTime() + 60_000);

    await receivePushedEvents(
      {
        inbox: new DrizzleInbox(db, CIPHER, NO_JOB),
        eventChain: hmacEventChain,
        clock: { now: () => later },
      },
      { deviceId, appVersion: "1.4.0", telemetry: TELEMETRY, events: linked(event(5)) },
    );

    expect((await deviceStateOf(deviceId))?.lastAcceptedPushAt).toEqual(NOW);
    expect((await deviceStateOf(deviceId))?.lastPushedAt).toEqual(later);
  });

  it("leaves no accepted push for a register whose version is not accepted", async () => {
    const { deviceId } = await insertEnrolledInstallation();

    await push(deviceId, linked(event(1)), "not-a-version");

    expect((await deviceStateOf(deviceId))?.lastAcceptedPushAt).toBeNull();
  });

  it("opens a critical update-required alert for the register, with the device and the version, when its version is not accepted", async () => {
    const { deviceId, registerId } = await insertEnrolledInstallation();

    await push(deviceId, linked(event(1)), "not-a-version");

    const rows = await db.select().from(alerts).where(eq(alerts.scope, registerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "update_required",
      level: "critical",
      audience: "all",
      openedAt: NOW,
      detail: { deviceId, appVersion: "not-a-version" },
      conditionClearedAt: null,
    });
  });

  it("opens the alert once for as many pushes as the register makes with that version", async () => {
    const { deviceId, registerId } = await insertEnrolledInstallation();

    await push(deviceId, [], "not-a-version");
    await push(deviceId, [], "not-a-version");

    const rows = await db.select().from(alerts).where(eq(alerts.scope, registerId));
    expect(rows).toHaveLength(1);
  });

  it("marks the alert as cleared when the register reports an accepted version, without resolving it", async () => {
    const { deviceId, registerId } = await insertEnrolledInstallation();
    await push(deviceId, [], "not-a-version");

    await push(deviceId, linked(event(1)));

    const [row] = await db.select().from(alerts).where(eq(alerts.scope, registerId));
    expect(row).toMatchObject({ conditionClearedAt: NOW, resolvedAt: null });
  });

  it("raises no alert for an accepted version", async () => {
    const { deviceId, registerId } = await insertEnrolledInstallation();

    await push(deviceId, linked(event(1)));

    expect(await db.select().from(alerts).where(eq(alerts.scope, registerId))).toEqual([]);
  });

  it("raises no alert for an installation the cloud revoked", async () => {
    const { deviceId, registerId } = await insertEnrolledInstallation();
    await db
      .update(registerInstallations)
      .set({ revokedAt: NOW, revocationReason: "replaced" })
      .where(eq(registerInstallations.id, deviceId));

    await push(deviceId, linked(event(1)), "not-a-version");

    expect(await db.select().from(alerts).where(eq(alerts.scope, registerId))).toEqual([]);
  });
});
