import { randomUUID } from "node:crypto";
import {
  applyPendingEvents,
  type QuarantineRelease,
  releaseQuarantinedEvent,
} from "@purosur/domain/sync/use-cases";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openAlert } from "../alerts/open-alert.js";
import { alerts, auditLog, inbox, users } from "../platform/db/schema.js";
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
import { DrizzleQuarantineRelease } from "./drizzle-quarantine-release.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import { insertQuarantinedEvent, QUARANTINED_AT } from "./test-support/quarantined-events.js";

// PGlite serves every query on one connection, so a release queued behind a held lock, and the
// privileges of the cloud's own role, need a real Postgres.
const NOW = new Date("2026-10-08T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("quarantine_release");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function quarantinedEventOf(
  aggregateId: string,
  installation?: { deviceId: string; locationId: string },
) {
  const { deviceId, locationId } =
    installation ??
    (await insertEnrolledInstallation(db, { now: NOW, registerName: randomUUID() }));
  const eventId = await insertQuarantinedEvent(db, deviceId, {
    aggregateType: "CashSession",
    aggregateId,
  });
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email: `${randomUUID()}@example.com`, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await openAlert(
    db,
    {
      kind: "events_quarantined",
      scope: deviceId,
      detail: { deviceId },
    },
    { now: () => NOW },
  );
  return { eventId, deviceId, locationId, userId: user.id };
}

function release(input: { eventId: string; locationId: string; releasedBy: string }) {
  return releaseQuarantinedEvent(
    { quarantineRelease: new DrizzleQuarantineRelease(db), clock: { now: () => NOW } },
    input,
  );
}

function applyEvents() {
  return applyPendingEvents(
    {
      eventApplication: new DrizzleEventApplication(
        db,
        () => NOW,
        async () => {},
      ),
      upcaster: syncedEventUpcaster,
      clock: { now: () => NOW },
      quarantineNotices: { quarantined: () => {} },
    },
    { limit: 100 },
  );
}

function holdDeviceQuarantinesLock(holder: postgres.ReservedSql, deviceId: string) {
  return holder`select pg_advisory_xact_lock(hashtextextended(${`device_quarantines:${deviceId}`}, 0))`;
}

function holdAggregateLock(holder: postgres.ReservedSql, aggregateId: string) {
  return holder`select pg_advisory_xact_lock(
    hashtextextended(json_build_array('CashSession'::text, ${aggregateId}::text)::text, 0))`;
}

async function eventRow(eventId: string) {
  const [row] = await db.select().from(inbox).where(eq(inbox.eventId, eventId));
  return row;
}

async function alertOf(deviceId: string) {
  const [row] = await db
    .select({ resolvedAt: alerts.resolvedAt })
    .from(alerts)
    .where(and(eq(alerts.kind, "events_quarantined"), eq(alerts.scope, deviceId)));
  return row;
}

describe("releasing a quarantined event on a real Postgres", () => {
  it("waits for the apply worker's hold on the aggregate, then releases once it is let go", async () => {
    const aggregateId = randomUUID();
    const { eventId, locationId, userId } = await quarantinedEventOf(aggregateId);
    const holder = await sql.reserve();
    let released: ReturnType<typeof release> | undefined;
    try {
      await holder`begin`;
      await holdAggregateLock(holder, aggregateId);

      released = release({ eventId, locationId, releasedBy: userId });
      await waitForLockWaiters(sql, 1);

      expect(await eventRow(eventId)).toMatchObject({ attempts: 8, quarantinedAt: QUARANTINED_AT });
    } finally {
      await holder`rollback`;
      holder.release();
    }

    expect(await released).toEqual({ kind: "released" });
    expect(await eventRow(eventId)).toMatchObject({ attempts: 0, quarantinedAt: null });
  }, 30_000);

  it("releases, records the release and resolves the alert as the cloud's own role", async () => {
    const { eventId, deviceId, locationId, userId } = await quarantinedEventOf(randomUUID());

    await release({ eventId, locationId, releasedBy: userId });

    expect(await eventRow(eventId)).toMatchObject({ attempts: 0, quarantinedAt: null });
    expect(await alertOf(deviceId)).toEqual({ resolvedAt: NOW });
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, eventId));
    expect(audit).toEqual([expect.objectContaining({ entity: "synced_event", actorId: userId })]);
  }, 30_000);

  it("keeps the device's alert open while another of its events stays quarantined", async () => {
    const first = await quarantinedEventOf(randomUUID());
    await quarantinedEventOf(randomUUID(), first);

    await release({
      eventId: first.eventId,
      locationId: first.locationId,
      releasedBy: first.userId,
    });

    expect(await eventRow(first.eventId)).toMatchObject({ attempts: 0, quarantinedAt: null });
    expect(await alertOf(first.deviceId)).toEqual({ resolvedAt: null });
  }, 30_000);

  it("resolves the device's alert when its last two quarantined events are released at the same time", async () => {
    const first = await quarantinedEventOf(randomUUID());
    const second = await quarantinedEventOf(randomUUID(), first);

    const [firstOutcome, secondOutcome] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holdDeviceQuarantinesLock(holder, first.deviceId),
      () =>
        release({ eventId: first.eventId, locationId: first.locationId, releasedBy: first.userId }),
      () =>
        release({
          eventId: second.eventId,
          locationId: second.locationId,
          releasedBy: second.userId,
        }),
    );

    expect([firstOutcome, secondOutcome]).toEqual([{ kind: "released" }, { kind: "released" }]);
    expect(await alertOf(first.deviceId)).toEqual({ resolvedAt: NOW });
  }, 30_000);

  it("keeps the device's alert open when one of its events is quarantined while its last quarantined event is released", async () => {
    const released = await quarantinedEventOf(randomUUID());
    const failing = await insertInboxEvent(db, released.deviceId, {
      aggregateType: "CashSession",
      aggregateId: randomUUID(),
      eventType: "cash_movement_recorded",
      schemaVersion: 1,
      attempts: 7,
    });

    const [releaseOutcome] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holdDeviceQuarantinesLock(holder, released.deviceId),
      () =>
        release({
          eventId: released.eventId,
          locationId: released.locationId,
          releasedBy: released.userId,
        }),
      applyEvents,
    );

    expect(releaseOutcome).toEqual({ kind: "released" });
    expect(await eventRow(failing)).toMatchObject({ attempts: 8, quarantinedAt: NOW });
    const deviceAlerts = await db
      .select({ resolvedAt: alerts.resolvedAt })
      .from(alerts)
      .where(and(eq(alerts.kind, "events_quarantined"), eq(alerts.scope, released.deviceId)));
    expect(deviceAlerts).toContainEqual({ resolvedAt: null });
  }, 30_000);

  it("leaves the event quarantined, unrecorded and its alert open when the release fails midway", async () => {
    const { eventId, deviceId, locationId, userId } = await quarantinedEventOf(randomUUID());
    const store = new DrizzleQuarantineRelease(db);
    const failing: QuarantineRelease = {
      transaction: (work) =>
        store.transaction((tx) =>
          work(
            Object.create(tx, {
              recordDeviceQuarantineCleared: {
                value: async (id: string, at: Date) => {
                  await tx.recordDeviceQuarantineCleared(id, at);
                  throw new Error("connection lost");
                },
              },
            }),
          ),
        ),
    };

    await expect(
      releaseQuarantinedEvent(
        { quarantineRelease: failing, clock: { now: () => NOW } },
        { eventId, locationId, releasedBy: userId },
      ),
    ).rejects.toThrow("connection lost");

    expect(await eventRow(eventId)).toMatchObject({ attempts: 8, quarantinedAt: QUARANTINED_AT });
    expect(await alertOf(deviceId)).toEqual({ resolvedAt: null });
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, eventId))).toEqual([]);
  }, 30_000);
});
