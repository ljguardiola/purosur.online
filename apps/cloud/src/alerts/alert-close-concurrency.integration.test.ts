import { closeAlert, escalateOverdueAlerts } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, auditLog, roles, users } from "../platform/db/schema.js";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

// PGlite serves every query on one connection, so these races need a real Postgres.
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

function closingPorts(now: () => Date) {
  return {
    store: new DrizzleAlertStore(db, () => NOON),
    clock: { now },
    hasher: { hash: hashSourceAddress },
  };
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

    const [firstOutcome, secondOutcome] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from alerts where id = ${alertId} for update`,
      () =>
        closeAlert(
          closingPorts(() => NOON),
          { alertId, closedBy: firstActorId },
        ),
      () =>
        closeAlert(
          closingPorts(() => new Date(NOON.getTime() + 1_000)),
          {
            alertId,
            closedBy: secondActorId,
          },
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

async function insertOverdueAlert(): Promise<string> {
  const [row] = await db
    .insert(alerts)
    .values({
      kind: "user_email_changed",
      scope: "user-overdue",
      level: "warning",
      audience: "all",
      detail: {},
      openedAt: new Date(NOON.getTime() - 25 * 60 * 60 * 1000),
      escalateAt: new Date(NOON.getTime() - 60 * 60 * 1000),
    })
    .returning({ id: alerts.id });
  if (!row) {
    throw new Error("test setup: inserting the alert returned no row");
  }
  return row.id;
}

async function escalateWhileClosureCommits(alertId: string): Promise<number> {
  const holder = await sql.reserve();
  let escalation: Promise<number> | undefined;
  let committed = false;
  try {
    await holder`begin`;
    await holder`update alerts set resolved_at = ${NOON.toISOString()} where id = ${alertId}`;
    escalation = escalateOverdueAlerts({
      store: new DrizzleAlertStore(db, () => NOON),
      clock: { now: () => NOON },
    });
    escalation.catch(() => {});
    await waitForLockWaiters(sql, 1);
    await holder`commit`;
    committed = true;
  } finally {
    if (!committed) {
      await holder`rollback`;
    }
    holder.release();
  }
  return escalation;
}

describe("escalating an overdue alert while its closure commits on a real Postgres", () => {
  it("leaves the alert closed and unescalated once the escalation gets past the closure's lock", async () => {
    const alertId = await insertOverdueAlert();

    const escalatedCount = await escalateWhileClosureCommits(alertId);

    expect(escalatedCount).toBe(0);
    const [row] = await db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row).toMatchObject({ resolvedAt: NOON, level: "warning", escalatedAt: null });
  }, 30_000);
});
