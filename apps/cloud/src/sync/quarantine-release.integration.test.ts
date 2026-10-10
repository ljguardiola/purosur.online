import { randomUUID } from "node:crypto";
import { type QuarantineRelease, releaseQuarantinedEvent } from "@purosur/domain/sync/use-cases";
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
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleQuarantineRelease } from "./drizzle-quarantine-release.js";
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

async function quarantinedEventOf(aggregateId: string) {
  const { deviceId, locationId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: randomUUID(),
  });
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
      scope: eventId,
      detail: {
        deviceId,
        eventId,
        eventType: "sale_completed",
        aggregateType: "CashSession",
        aggregateId,
        reason: { kind: "not_recorded" },
      },
    },
    { now: () => NOW },
  );
  return { eventId, locationId, userId: user.id };
}

function release(input: { eventId: string; locationId: string; releasedBy: string }) {
  return releaseQuarantinedEvent(
    { quarantineRelease: new DrizzleQuarantineRelease(db), clock: { now: () => NOW } },
    input,
  );
}

function holdAggregateLock(holder: postgres.ReservedSql, aggregateId: string) {
  return holder`select pg_advisory_xact_lock(
    hashtextextended(json_build_array('CashSession'::text, ${aggregateId}::text)::text, 0))`;
}

async function eventRow(eventId: string) {
  const [row] = await db.select().from(inbox).where(eq(inbox.eventId, eventId));
  return row;
}

async function alertOf(eventId: string) {
  const [row] = await db
    .select({ resolvedAt: alerts.resolvedAt })
    .from(alerts)
    .where(and(eq(alerts.kind, "events_quarantined"), eq(alerts.scope, eventId)));
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
    const { eventId, locationId, userId } = await quarantinedEventOf(randomUUID());

    await release({ eventId, locationId, releasedBy: userId });

    expect(await eventRow(eventId)).toMatchObject({ attempts: 0, quarantinedAt: null });
    expect(await alertOf(eventId)).toEqual({ resolvedAt: NOW });
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, eventId));
    expect(audit).toEqual([expect.objectContaining({ entity: "synced_event", actorId: userId })]);
  }, 30_000);

  it("leaves the event quarantined, unrecorded and its alert open when the release fails midway", async () => {
    const { eventId, locationId, userId } = await quarantinedEventOf(randomUUID());
    const store = new DrizzleQuarantineRelease(db);
    const failing: QuarantineRelease = {
      transaction: (work) =>
        store.transaction((tx) =>
          work(
            Object.create(tx, {
              resolveQuarantineAlert: {
                value: async (id: string, at: Date) => {
                  await tx.resolveQuarantineAlert(id, at);
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
    expect(await alertOf(eventId)).toEqual({ resolvedAt: null });
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, eventId))).toEqual([]);
  }, 30_000);
});
