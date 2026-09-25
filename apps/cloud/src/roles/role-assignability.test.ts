import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserCreationRoutes } from "../users/user-creation-route.js";
import { registerUsersListRoute } from "../users/users-list-route.js";
import { registerRoleCreationRoutes } from "./role-creation-route.js";
import { registerRolesListRoute } from "./roles-list-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let administratorId: string;
const currentTime = NOON;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

/** Inserts a session already carrying a valid passkey authorization, the way a passkey sign-in would. */
async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: NOON,
  });
  return rawSessionId;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

beforeEach(async () => {
  await testDatabase.clear();

  const locationId = await seededLocationId(db);
  const [administrator] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!administrator) {
    throw new Error("test setup: seeding the administrator returned no row");
  }
  administratorId = administrator.id;
  await db.insert(userRoles).values({
    userId: administratorId,
    roleId: await seededAdministratorRoleId(),
  });

  app = Fastify();
  const routeOptions = { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => currentTime };
  registerRoleCreationRoutes(app, routeOptions);
  registerRolesListRoute(app, routeOptions);
  registerUserCreationRoutes(app, routeOptions);
  registerUsersListRoute(app, routeOptions);
});

afterEach(async () => {
  await app.close();
});

describe("a role created through POST /roles", () => {
  it("is immediately assignable through POST /users (the same authorization covering both, unconsumed), and shows up in GET /users and GET /roles", async () => {
    const rawSessionId = await insertSession(administratorId);

    const roleResponse = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
      payload: { name: "Depósito", permissions: ["view_stock_balances"] },
    });
    expect(roleResponse.statusCode).toBe(201);
    const roleId = roleResponse.json().id as string;

    const userResponse = await app.inject({
      method: "POST",
      url: "/users",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
      payload: { first_name: "New Hire", email: "newhire@example.com", role_id: roleId },
    });

    expect(userResponse.statusCode).toBe(201);
    expect(userResponse.json()).toMatchObject({
      role: { id: roleId, name: "Depósito", is_administrator: false },
    });

    const usersList = await app.inject({
      method: "GET",
      url: "/users",
      headers: cookieHeader(rawSessionId),
    });
    expect(usersList.json()).toContainEqual(
      expect.objectContaining({ role: { id: roleId, name: "Depósito", is_administrator: false } }),
    );

    const rolesList = await app.inject({
      method: "GET",
      url: "/roles",
      headers: cookieHeader(rawSessionId),
    });
    expect(rolesList.json()).toContainEqual(
      expect.objectContaining({ id: roleId, name: "Depósito", user_count: 1 }),
    );
  });
});
