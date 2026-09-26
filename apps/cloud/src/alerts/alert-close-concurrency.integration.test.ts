import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, auditLog, roles, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { type CloseAlertOutcome, closeAlert } from "./alert-close-route.js";

// PGlite serves every query on one connection and can never race two closes of the same alert
// against each other, so `closeAlert`'s own `SELECT ... FOR UPDATE` never has to stop a real
// double close. This races it for real on a real Postgres.
const NOON = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_close_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test setup: ${count} closes never queued behind the held lock`);
}

/**
 * Holds `FOR UPDATE` on the alert row on a reserved connection, starts `first`, starts `second`
 * only once `first` is queued behind that lock, then lets both go once `second` is queued too.
 * Postgres's lock wait queue is FIFO for two waiters on the very same lock, so `first` — queued
 * strictly before `second` — is guaranteed to be granted the row first.
 */
async function runQueuedBehindRowLock<T>(
  alertId: string,
  first: () => Promise<T>,
  second: () => Promise<T>,
): Promise<[T, T]> {
  const reserved = await sql.reserve();
  let firstResult: Promise<T> | undefined;
  let secondResult: Promise<T> | undefined;
  try {
    await reserved`begin`;
    await reserved`select id from alerts where id = ${alertId} for update`;
    firstResult = first();
    await waitForLockWaiters(1);
    secondResult = second();
    await waitForLockWaiters(2);
  } finally {
    await reserved`rollback`;
    reserved.release();
    await Promise.allSettled([firstResult, secondResult]);
  }
  return Promise.all([firstResult, secondResult]) as Promise<[T, T]>;
}

async function insertActor(name: string): Promise<string> {
  const locationId = await seededLocationId(db);
  const [role] = await db
    .insert(roles)
    .values({ name: `Closer ${name}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: inserting the role returned no row");
  }
  const [user] = await db
    .insert(users)
    .values({
      firstName: name,
      email: `${name.toLowerCase()}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user.id;
}

async function insertOpenAlert(): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: "user_email_changed",
      scope: "user-1",
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: NOON,
    })
    .returning({ id: alerts.id });
  if (!row) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return row.id;
}

describe("closing the same alert from two actors at once on a real Postgres", () => {
  it("closes it for the first to queue, tells the second it was already closed, and audits only the first", async () => {
    const alertId = await insertOpenAlert();
    const firstActorId = await insertActor("Grace");
    const secondActorId = await insertActor("Ada");

    const [firstOutcome, secondOutcome] = await runQueuedBehindRowLock<CloseAlertOutcome>(
      alertId,
      () => closeAlert(db, { id: alertId, actorId: firstActorId }, { now: () => NOON }),
      () =>
        closeAlert(
          db,
          { id: alertId, actorId: secondActorId },
          { now: () => new Date(NOON.getTime() + 1_000) },
        ),
    );

    expect(firstOutcome.kind).toBe("closed");
    expect(secondOutcome).toEqual({ kind: "already_closed" });
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ resolvedAt: NOON, resolvedBy: firstActorId });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, alertId));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      entity: "alert",
      actorId: firstActorId,
      previousValue: { resolvedAt: null },
      newValue: { resolvedAt: NOON.toISOString() },
    });
  }, 30_000);
});
