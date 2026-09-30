import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { roles, sessions, userRoles, users } from "../platform/db/schema.js";
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
// pool; this test pins the order by holding a row lock until both requests queue behind it.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("user_role_change_race");
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

async function insertCashierRole(): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: `Cajera ${randomUUID()}`, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
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

// The edit route takes this same Administrator role row lock before counting active Administrators.
async function holdAdministratorRoleLock(holder: postgres.ReservedSql): Promise<void> {
  await holder`select id from roles where is_administrator = true for update`;
}

describe("demoting the two last active Administrators at once on a real Postgres", () => {
  it("lets exactly one demotion succeed and refuses the other as the now-last active Administrator", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    const cashierRoleId = await insertCashierRole();
    const firstAdministratorId = await insertUser(
      `first-${randomUUID()}@example.com`,
      administratorRoleId,
    );
    const secondAdministratorId = await insertUser(
      `second-${randomUUID()}@example.com`,
      administratorRoleId,
    );
    const firstCookie = `${SESSION_COOKIE_NAME}=${await insertSession(firstAdministratorId)}`;
    const secondCookie = `${SESSION_COOKIE_NAME}=${await insertSession(secondAdministratorId)}`;

    const demoteFirst = () =>
      app.inject({
        method: "PUT",
        url: `/users/${firstAdministratorId}`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie: secondCookie },
        payload: {
          email: `first-${randomUUID()}@example.com`,
          role_id: cashierRoleId,
          version: 1,
        },
      });
    const demoteSecond = () =>
      app.inject({
        method: "PUT",
        url: `/users/${secondAdministratorId}`,
        headers: { origin: BACKOFFICE_ORIGIN, cookie: firstCookie },
        payload: {
          email: `second-${randomUUID()}@example.com`,
          role_id: cashierRoleId,
          version: 1,
        },
      });

    const [firstResponse, secondResponse] = await runQueuedBehindHeldLock(
      sql,
      holdAdministratorRoleLock,
      demoteFirst,
      demoteSecond,
    );

    const statusCodes = [firstResponse.statusCode, secondResponse.statusCode].sort();
    expect(statusCodes).toEqual([200, 409]);
    const refused = [firstResponse, secondResponse].find((response) => response.statusCode === 409);
    expect(refused?.json()).toMatchObject({ code: "last_administrator" });

    const remainingAdministrators = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, administratorRoleId));
    expect(remainingAdministrators).toHaveLength(1);
  });
});
