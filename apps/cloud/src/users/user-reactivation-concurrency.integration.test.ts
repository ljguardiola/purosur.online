import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { voidOutstandingRecoveryTokens } from "../credentials/void-outstanding-recovery-tokens.js";
import { auditLog, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserReactivationRoutes } from "./user-reactivation-route.js";

// PGlite serializes every transaction, so racing requests can only interleave on a real Postgres
// pool; this test pins the order by holding a row lock until both requests queue behind it.
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
  registerUserReactivationRoutes(app, {
    voidOutstandingRecoveryTokens,
    db,
    now: () => new Date(),
    backofficeOrigin: BACKOFFICE_ORIGIN,
  });
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
    .values({ firstName: "Grace Villalba", email, locationId: await seededLocationId(db) })
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
        method: "DELETE",
        url: `/users/${targetId}/deactivation`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    // The reactivation route takes this same row lock before reading `active`.
    const [firstResponse, secondResponse] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from users where id = ${targetId} for update`,
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
