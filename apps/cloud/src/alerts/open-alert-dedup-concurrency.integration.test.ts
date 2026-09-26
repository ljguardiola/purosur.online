import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgresJs, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import pg from "pg";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alertDeliveries, alerts, roles, userRoles, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { type OpenAlertInput, type OpenAlertOutcome, openAlert } from "./open-alert.js";

// PGlite serves every query on one connection and can never race two `openAlert` calls against
// each other, so the dedup index's own concurrent path (`isAlertOpenDedupViolation`, the savepoint
// around the insert) never runs under it. This races it for real on both drivers the app actually
// uses: postgres-js for the routes, node-postgres for the recovery worker
// (`recovery-worker.ts`).
const NOON = new Date("2026-01-05T12:00:00.000Z");

async function insertAdministrator<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const locationId = await seededLocationId(db);
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email: `ada-${randomUUID()}@example.com`, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: administratorRole.id });
  return user.id;
}

/**
 * Two `openAlert` calls for the same kind and scope, the first held open (uncommitted) until the
 * second is observed blocked behind it. Committing the first then unblocks the second, which must
 * find the dedup violation, roll back only its own savepoint, and still commit whatever else its
 * own transaction did.
 */
async function racesOpenAlertDedup<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  waitForLockWaiters: (count: number) => Promise<void>,
): Promise<void> {
  const recipientId = await insertAdministrator(db);
  const scope = `user-${randomUUID()}`;
  const input: OpenAlertInput = {
    kind: "user_email_changed",
    scope,
    detail: { previousEmail: "old@example.com", newEmail: "new@example.com" },
  };

  let firstOutcome: OpenAlertOutcome | undefined;
  let resolveStarted: () => void = () => {};
  const firstStarted = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  let resolveRelease: () => void = () => {};
  const release = new Promise<void>((resolve) => {
    resolveRelease = resolve;
  });
  const firstCommitted = db.transaction(async (tx) => {
    firstOutcome = await openAlert(tx, input, { now: () => NOON });
    resolveStarted();
    await release;
    return firstOutcome;
  });

  await firstStarted;
  if (firstOutcome?.kind !== "opened") {
    throw new Error("test setup: the first openAlert call never opened the alert");
  }
  const firstAlertId = firstOutcome.alertId;

  const secondCommitted = db.transaction(async (tx) => {
    const outcome = await openAlert(tx, input, { now: () => new Date(NOON.getTime() + 1_000) });
    // The caller's own other work, in the very same transaction as the losing `openAlert` call: it
    // must still commit even though the insert attempt inside `openAlert` failed on the unique
    // index, proving the savepoint kept that failure from poisoning this outer transaction.
    await tx.update(users).set({ firstName: "Ada (marked)" }).where(eq(users.id, recipientId));
    return outcome;
  });

  await waitForLockWaiters(1);
  resolveRelease();
  const [, secondOutcome] = await Promise.all([firstCommitted, secondCommitted]);

  expect(secondOutcome).toEqual({ kind: "already_open", alertId: firstAlertId });

  const openAlerts = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.kind, "user_email_changed"), eq(alerts.scope, scope)));
  expect(openAlerts).toHaveLength(1);

  const deliveries = await db
    .select()
    .from(alertDeliveries)
    .where(eq(alertDeliveries.alertId, firstAlertId));
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]?.recipientUserId).toBe(recipientId);

  const [recipientAfter] = await db
    .select({ firstName: users.firstName })
    .from(users)
    .where(eq(users.id, recipientId));
  expect(recipientAfter?.firstName).toBe("Ada (marked)");
}

describe("openAlert dedup raced through postgres-js on a real Postgres", () => {
  let integrationDb: IntegrationDatabase;
  let sql: ReturnType<typeof postgres>;
  let db: PostgresJsDatabase<Record<string, never>>;

  beforeAll(async () => {
    integrationDb = await createIntegrationDatabase("open_alert_dedup_postgres_js");
    sql = postgres(integrationDb.databaseUrl, { max: 6 });
    db = drizzlePostgresJs(sql);
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
    throw new Error(`test setup: ${count} openAlert calls never queued behind the first`);
  }

  it("dedups: the second call gets already_open, one alert, one set of deliveries, and its own transaction still commits", async () => {
    await racesOpenAlertDedup(db, waitForLockWaiters);
  }, 30_000);
});

describe("openAlert dedup raced through node-postgres on a real Postgres", () => {
  let integrationDb: IntegrationDatabase;
  let pool: pg.Pool;
  let db: NodePgDatabase<Record<string, never>>;

  beforeAll(async () => {
    integrationDb = await createIntegrationDatabase("open_alert_dedup_node_postgres");
    pool = new pg.Pool({ connectionString: integrationDb.databaseUrl, max: 6 });
    db = drizzleNodePostgres(pool);
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await integrationDb.close();
  });

  async function waitForLockWaiters(count: number): Promise<void> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const { rows } = await pool.query<{ waiting: number }>(
        `select count(*)::int as waiting from pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if ((rows[0]?.waiting ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`test setup: ${count} openAlert calls never queued behind the first`);
  }

  it("dedups: the second call gets already_open, one alert, one set of deliveries, and its own transaction still commits", async () => {
    await racesOpenAlertDedup(db, waitForLockWaiters);
  }, 30_000);
});
