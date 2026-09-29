import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerUserEditRoutes } from "./user-edit-route.js";

// PGlite serializes every transaction, so racing requests can only interleave on a real Postgres
// pool; this test pins the order by holding both users' row locks until both requests queue behind them.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_mutual_edit_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerUserEditRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN });
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

describe("two users editing each other at once on a real Postgres", () => {
  it("applies both edits", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const firstId = await insertUser(`first-${randomUUID()}@example.com`, administratorRoleId);
    const secondId = await insertUser(`second-${randomUUID()}@example.com`, administratorRoleId);
    const firstCookie = `${SESSION_COOKIE_NAME}=${await insertSession(firstId)}`;
    const secondCookie = `${SESSION_COOKIE_NAME}=${await insertSession(secondId)}`;
    const firstNewEmail = `first-${randomUUID()}@example.com`;
    const secondNewEmail = `second-${randomUUID()}@example.com`;
    const edit = (targetId: string, email: string, cookie: string) => () =>
      app.inject({
        method: "POST",
        url: `/users/${targetId}/edit`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
        payload: { email, role_id: administratorRoleId, version: 1 },
      });

    const [secondEdit, firstEdit] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from users where id in ${sql([firstId, secondId])} for update`,
      edit(secondId, secondNewEmail, firstCookie),
      edit(firstId, firstNewEmail, secondCookie),
    );

    expect(secondEdit.statusCode).toBe(200);
    expect(firstEdit.statusCode).toBe(200);
    const edited = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, [firstId, secondId]));
    expect(edited).toEqual(
      expect.arrayContaining([
        { id: firstId, email: firstNewEmail },
        { id: secondId, email: secondNewEmail },
      ]),
    );
    const audited = await db
      .select({ entityId: auditLog.entityId, actorId: auditLog.actorId })
      .from(auditLog)
      .where(inArray(auditLog.entityId, [firstId, secondId]));
    expect(audited).toEqual(
      expect.arrayContaining([
        { entityId: firstId, actorId: secondId },
        { entityId: secondId, actorId: firstId },
      ]),
    );
    expect(audited).toHaveLength(2);
  });
});
