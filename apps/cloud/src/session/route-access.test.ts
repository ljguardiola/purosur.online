import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  ADMINISTRATOR_ACCESS,
  enforceRouteAccess,
  OPEN_SESSION_ACCESS,
  permissionAccess,
  registerRouteAccessInventory,
} from "./route-access.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  app = Fastify();
  // Proves the permission-level check with a test-only route, per #287's constraint that no
  // production endpoint needs one yet: `void_sale` stands in for whichever permission is checked.
  app.get(
    "/test-only/void-sale",
    { config: { access: permissionAccess("void_sale") } },
    async (request, reply) => {
      const openSession = await enforceRouteAccess(request, reply, { db, now: NOON });
      if (!openSession) {
        return;
      }
      await reply.code(200).send({ ok: true });
    },
  );
  app.get(
    "/test-only/administrator-only",
    { config: { access: ADMINISTRATOR_ACCESS } },
    async (request, reply) => {
      const openSession = await enforceRouteAccess(request, reply, { db, now: NOON });
      if (!openSession) {
        return;
      }
      await reply.code(200).send({ ok: true });
    },
  );
  app.get(
    "/test-only/open-session",
    { config: { access: OPEN_SESSION_ACCESS } },
    async (request, reply) => {
      const openSession = await enforceRouteAccess(request, reply, { db, now: NOON });
      if (!openSession) {
        return;
      }
      await reply.code(200).send({ ok: true });
    },
  );
});

afterEach(async () => {
  await app.close();
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

async function insertRole(name: string, permissionKeys: string[] = []): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  return role.id;
}

async function insertUser(roleId: string, email: string): Promise<string> {
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
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

function callRoute(path: string, rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: path,
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

describe("enforceRouteAccess", () => {
  it("returns 401 unauthenticated when no session is open", async () => {
    const response = await callRoute("/test-only/void-sale");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("grants access to a user whose role holds the declared permission", async () => {
    const roleId = await insertRole("Cajera", ["void_sale"]);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/void-sale", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("rejects a user whose role does not hold the declared permission with 403 forbidden", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/void-sale", rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("grants an Administrator access to a permission-declared route their role never explicitly holds", async () => {
    const userId = await insertUser(await seededAdministratorRoleId(), "admin@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/void-sale", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("rejects a non-Administrator on an Administrator-only route even holding the matching permission", async () => {
    const roleId = await insertRole("Cajera", ["void_sale"]);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/administrator-only", rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("grants an Administrator access to an Administrator-only route", async () => {
    const userId = await insertUser(await seededAdministratorRoleId(), "admin@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/administrator-only", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("grants any open session access to an open-session-declared route, permission or not", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/open-session", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("reflects a permission granted to the user's role without signing in again", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const before = await callRoute("/test-only/void-sale", rawSessionId);
    await db.insert(rolePermissions).values({ roleId, permissionKey: "void_sale" });
    const after = await callRoute("/test-only/void-sale", rawSessionId);

    expect(before.statusCode).toBe(403);
    expect(after.statusCode).toBe(200);
  });
});

describe("registerRouteAccessInventory", () => {
  it("collects the declared access of every registered route, excluding the auto-mirrored HEAD of a GET", async () => {
    const inventoryApp = Fastify();
    const getInventory = registerRouteAccessInventory(inventoryApp);
    inventoryApp.get("/foo", { config: { access: OPEN_SESSION_ACCESS } }, async () => "ok");
    inventoryApp.post("/bar", { config: { access: ADMINISTRATOR_ACCESS } }, async () => "ok");

    expect(getInventory()).toEqual([
      { method: "GET", url: "/foo", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/bar", access: ADMINISTRATOR_ACCESS },
    ]);

    await inventoryApp.close();
  });

  it("reports a route with no declared access as undefined", async () => {
    const inventoryApp = Fastify();
    const getInventory = registerRouteAccessInventory(inventoryApp);
    inventoryApp.get("/undeclared", async () => "ok");

    expect(getInventory()).toEqual([{ method: "GET", url: "/undeclared", access: undefined }]);

    await inventoryApp.close();
  });
});
