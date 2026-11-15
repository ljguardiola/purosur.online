import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerAlertEmailOptInRoutes } from "./alert-email-opt-in-routes.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("alert_email_opt_in_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerAlertEmailOptInRoutes(app, {
    db,
    now: () => new Date(),
    backofficeOrigin: BACKOFFICE_ORIGIN,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertUser(administrator: boolean, optedInAt: Date | null): Promise<string> {
  const [role] = administrator
    ? await db.select({ id: roles.id }).from(roles).where(eq(roles.isAdministrator, true))
    : await db
        .insert(roles)
        .values({ name: `Cajera ${randomUUID()}`, isAdministrator: false })
        .returning({ id: roles.id });
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Villalba",
      email: `${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
      alertEmailOptedInAt: optedInAt,
    })
    .returning({ id: users.id });
  if (!role || !user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  return user.id;
}

async function sessionCookie(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  const now = new Date();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: now,
    lastSeenAt: now,
    passkeyAuthorizedAt: now,
  });
  return `${SESSION_COOKIE_NAME}=${rawSessionId}`;
}

const holdUserRowLock = (userId: string) => (holder: postgres.ReservedSql) =>
  holder`select id from users where id = ${userId} for update`;

describe("changing the same opt-in twice at once on a real Postgres", () => {
  it("records the opt-in once when it is recorded twice, answering both the same moment", async () => {
    const userId = await insertUser(false, null);
    const cookie = await sessionCookie(userId);
    const record = () =>
      app.inject({
        method: "PUT",
        url: "/account/alert-email-opt-in",
        headers: { origin: BACKOFFICE_ORIGIN, cookie },
      });

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      holdUserRowLock(userId),
      record,
      record,
    );

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(second.json()).toEqual(first.json());
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, userId))).toHaveLength(1);
    expect(await db.select().from(alerts).where(eq(alerts.scope, userId))).toHaveLength(1);
  });

  it("withdraws the opt-in once when the user and the Administrator withdraw it together", async () => {
    const userId = await insertUser(false, new Date("2026-01-01T09:00:00.000Z"));
    const administratorId = await insertUser(true, null);
    const ownCookie = await sessionCookie(userId);
    const administratorCookie = await sessionCookie(administratorId);

    const [own, byAdministrator] = await runQueuedBehindHeldLock(
      sql,
      holdUserRowLock(userId),
      () =>
        app.inject({
          method: "DELETE",
          url: "/account/alert-email-opt-in",
          headers: { origin: BACKOFFICE_ORIGIN, cookie: ownCookie },
        }),
      () =>
        app.inject({
          method: "DELETE",
          url: `/users/${userId}/alert-email-opt-in`,
          headers: { origin: BACKOFFICE_ORIGIN, cookie: administratorCookie },
        }),
    );

    expect([own.statusCode, byAdministrator.statusCode]).toEqual([200, 200]);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, userId))).toHaveLength(1);
    expect(await db.select().from(alerts).where(eq(alerts.scope, userId))).toHaveLength(1);
  });
});
