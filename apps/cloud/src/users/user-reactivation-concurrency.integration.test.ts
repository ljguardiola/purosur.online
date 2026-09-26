import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, roles, sessions, userRoles, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserReactivationRoutes } from "./user-reactivation-route.js";

// PGlite serves every query on one connection and serializes transactions outright, so racing
// requests can only interleave on a real Postgres pool. This test pins the interleaving by holding
// a row lock on a connection of its own and waiting until both requests queue behind it, so the
// order in which they reach the database is decided by the test, not by timing.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_reactivation_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserReactivationRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
});

afterEach(async () => {
  await app.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!role) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return role.id;
}

async function insertUser(email: string, roleId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Grace Hopper", email, locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

async function insertInactiveUser(email: string, roleId: string): Promise<string> {
  const userId = await insertUser(email, roleId);
  await db.update(users).set({ active: false }).where(eq(users.id, userId));
  return userId;
}

/** Inserts a session already carrying a valid passkey authorization, the way a passkey sign-in would. */
async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  const now = new Date();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
    passkeyAuthorizedAt: now,
  });
  return rawSessionId;
}

type InjectRequest = () => Promise<LightMyRequestResponse>;

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await sql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test setup: ${count} requests never queued behind the held lock`);
}

/**
 * Holds `FOR UPDATE` on the target user row, starts `first`, starts `second` only once `first` is
 * waiting on that same lock (the reactivation route takes it before reading `active`), then lets
 * both go once `second` waits too.
 */
async function runQueuedBehindTargetUserLock(
  targetId: string,
  first: InjectRequest,
  second: InjectRequest,
): Promise<[LightMyRequestResponse, LightMyRequestResponse]> {
  const reserved = await sql.reserve();
  let firstResponse: Promise<LightMyRequestResponse> | undefined;
  let secondResponse: Promise<LightMyRequestResponse> | undefined;
  try {
    await reserved`begin`;
    await reserved`select id from users where id = ${targetId} for update`;
    firstResponse = first();
    await waitForLockWaiters(1);
    secondResponse = second();
    await waitForLockWaiters(2);
  } finally {
    await reserved`rollback`;
    reserved.release();
    await Promise.allSettled([firstResponse, secondResponse]);
  }
  return Promise.all([firstResponse, secondResponse]);
}

describe("reactivating the same target twice at once on a real Postgres", () => {
  it("lets exactly one reactivation succeed, answers the other not_found, and audits it once", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const targetId = await insertInactiveUser(
      `target-${randomUUID()}@example.com`,
      administratorRoleId,
    );
    const actorId = await insertUser(`actor-${randomUUID()}@example.com`, administratorRoleId);
    const cookie = `${SESSION_COOKIE_NAME}=${await insertSession(actorId)}`;

    const reactivate = () =>
      app.inject({
        method: "POST",
        url: `/users/${targetId}/reactivation`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const [firstResponse, secondResponse] = await runQueuedBehindTargetUserLock(
      targetId,
      reactivate,
      reactivate,
    );

    const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();
    expect(statusCodes).toEqual([200, 404]);

    const [row] = await db
      .select({ active: users.active, version: users.version })
      .from(users)
      .where(eq(users.id, targetId));
    expect(row?.active).toBe(true);
    expect(row?.version).toBe(2);

    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(1);
  });
});
