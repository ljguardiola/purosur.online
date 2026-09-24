import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  ADMINISTRATOR_ACCESS,
  OPEN_SESSION_ACCESS,
  OPEN_SESSION_PEEK_ACCESS,
  openSessionOf,
  originGuard,
  PUBLIC_ACCESS,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
  SESSION_COOKIE_ACCESS,
} from "./route-access.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let handlerRuns: number;

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
  registerRouteAccess(app);
  handlerRuns = 0;
  const sessionSource = routeSessionSource({ db, now: () => NOON });
  const answerWithSession = async (request: FastifyRequest, reply: FastifyReply) => {
    handlerRuns += 1;
    await reply.code(200).send({ user_id: openSessionOf(request).userId });
  };
  const answer = async (_request: FastifyRequest, reply: FastifyReply) => {
    handlerRuns += 1;
    await reply.code(200).send({ ok: true });
  };
  // No production endpoint needs a delegable permission yet: `void_sale` stands in for whichever
  // permission is checked.
  app.get(
    "/test-only/void-sale",
    { config: { access: permissionAccess("void_sale"), sessionSource } },
    answerWithSession,
  );
  app.get(
    "/test-only/administrator-only",
    { config: { access: ADMINISTRATOR_ACCESS, sessionSource } },
    answerWithSession,
  );
  app.get(
    "/test-only/open-session",
    { config: { access: OPEN_SESSION_ACCESS, sessionSource } },
    answerWithSession,
  );
  app.get(
    "/test-only/open-session-peek",
    { config: { access: OPEN_SESSION_PEEK_ACCESS, sessionSource } },
    answerWithSession,
  );
  app.get(
    "/test-only/session-cookie",
    { config: { access: SESSION_COOKIE_ACCESS, sessionSource } },
    answer,
  );
  app.get("/test-only/public", { config: { access: PUBLIC_ACCESS } }, answer);
  app.get("/test-only/undeclared", answer);
  app.get(
    "/test-only/origin-guarded",
    {
      preHandler: originGuard((request, reply) => {
        if (request.headers.origin !== BACKOFFICE_ORIGIN) {
          void reply.code(403).send({ code: "origin_rejected" });
          return false;
        }
        return true;
      }),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    answerWithSession,
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

async function insertSession(userId: string, lastSeenAt: Date = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: lastSeenAt,
    lastSeenAt,
  });
  return rawSessionId;
}

async function lastSeenAtOf(rawSessionId: string): Promise<Date | undefined> {
  const [session] = await db
    .select({ lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
  return session?.lastSeenAt;
}

function callRoute(path: string, rawSessionId?: string, extraHeaders: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: path,
    headers: {
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...extraHeaders,
    },
  });
}

describe("the declared access, enforced before every handler", () => {
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

  it("hands the handler the session it resolved, so the handler never resolves it again", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/open-session", rawSessionId);

    expect(response.json()).toEqual({ user_id: userId });
  });

  it("never runs the handler when the declared access is refused", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    await callRoute("/test-only/open-session");
    await callRoute("/test-only/administrator-only", rawSessionId);
    await callRoute("/test-only/void-sale", rawSessionId);

    expect(handlerRuns).toBe(0);
  });

  it("answers a public route without any session", async () => {
    const response = await callRoute("/test-only/public");

    expect(response.statusCode).toBe(200);
  });

  it("refuses a route with no declared access with 403 forbidden, even for an Administrator", async () => {
    const userId = await insertUser(await seededAdministratorRoleId(), "admin@example.com");
    const rawSessionId = await insertSession(userId);

    const anonymous = await callRoute("/test-only/undeclared");
    const administrator = await callRoute("/test-only/undeclared", rawSessionId);

    expect(anonymous.statusCode).toBe(403);
    expect(administrator.statusCode).toBe(403);
    expect(administrator.json()).toMatchObject({ code: "forbidden" });
    expect(handlerRuns).toBe(0);
  });

  it("touches last_seen_at for an open-session route", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const earlier = new Date(NOON.getTime() - 60_000);
    const rawSessionId = await insertSession(userId, earlier);

    await callRoute("/test-only/open-session", rawSessionId);

    expect(await lastSeenAtOf(rawSessionId)).toEqual(NOON);
  });

  it("resolves an open session without touching last_seen_at for an open-session-peek route", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const earlier = new Date(NOON.getTime() - 60_000);
    const rawSessionId = await insertSession(userId, earlier);

    const withSession = await callRoute("/test-only/open-session-peek", rawSessionId);
    const withoutSession = await callRoute("/test-only/open-session-peek");

    expect(withSession.json()).toEqual({ user_id: userId });
    expect(await lastSeenAtOf(rawSessionId)).toEqual(earlier);
    expect(withoutSession.statusCode).toBe(401);
    expect(withoutSession.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("requires only a session cookie, open or already ended, for a session-cookie route", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const endedSessionId = await insertSession(userId, new Date("2026-01-01T00:00:00.000Z"));

    const withoutCookie = await callRoute("/test-only/session-cookie");
    const withEndedCookie = await callRoute("/test-only/session-cookie", endedSessionId);

    expect(withoutCookie.statusCode).toBe(401);
    expect(withoutCookie.json()).toMatchObject({ code: "unauthenticated" });
    expect(withEndedCookie.statusCode).toBe(200);
  });

  it("runs the route's own origin guard before resolving the session", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const earlier = new Date(NOON.getTime() - 60_000);
    const rawSessionId = await insertSession(userId, earlier);

    const foreign = await callRoute("/test-only/origin-guarded", rawSessionId, {
      origin: "https://evil.example",
    });
    const own = await callRoute("/test-only/origin-guarded", rawSessionId, {
      origin: BACKOFFICE_ORIGIN,
    });

    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toEqual({ code: "origin_rejected" });
    expect(own.statusCode).toBe(200);
    expect(handlerRuns).toBe(1);
  });

  it("refuses to register a route whose declared access needs a session but names no session source", async () => {
    const bareApp = Fastify();
    registerRouteAccess(bareApp);

    expect(() =>
      bareApp.get("/no-source", { config: { access: OPEN_SESSION_ACCESS } }, async () => "ok"),
    ).toThrow(/GET \/no-source/);

    await bareApp.close();
  });

  it("installs once per app, however many route groups ask for it", async () => {
    const twiceApp = Fastify();
    registerRouteAccess(twiceApp);
    registerRouteAccess(twiceApp);
    twiceApp.get("/twice", { config: { access: PUBLIC_ACCESS } }, async () => "ok");

    expect(twiceApp.routeAccessInventory()).toEqual([
      { method: "GET", url: "/twice", access: PUBLIC_ACCESS },
    ]);
    await twiceApp.close();
  });
});

describe("the route access inventory", () => {
  it("collects the declared access of every registered route, excluding the auto-mirrored HEAD of a GET", async () => {
    const inventoryApp = Fastify();
    registerRouteAccess(inventoryApp);
    const sessionSource = routeSessionSource({ db });
    inventoryApp.get(
      "/foo",
      { config: { access: OPEN_SESSION_ACCESS, sessionSource } },
      async () => "ok",
    );
    inventoryApp.post(
      "/bar",
      { config: { access: ADMINISTRATOR_ACCESS, sessionSource } },
      async () => "ok",
    );

    expect(inventoryApp.routeAccessInventory()).toEqual([
      { method: "GET", url: "/foo", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/bar", access: ADMINISTRATOR_ACCESS },
    ]);

    await inventoryApp.close();
  });

  it("keeps a HEAD route registered on its own or alongside a GET", async () => {
    const inventoryApp = Fastify();
    registerRouteAccess(inventoryApp);
    inventoryApp.head("/alone", { config: { access: PUBLIC_ACCESS } }, async () => "ok");
    inventoryApp.route({
      method: ["HEAD", "GET"],
      url: "/both",
      config: { access: PUBLIC_ACCESS },
      handler: async () => "ok",
    });

    expect(inventoryApp.routeAccessInventory()).toEqual([
      { method: "HEAD", url: "/alone", access: PUBLIC_ACCESS },
      { method: "HEAD", url: "/both", access: PUBLIC_ACCESS },
      { method: "GET", url: "/both", access: PUBLIC_ACCESS },
    ]);

    await inventoryApp.close();
  });

  it("reports a GET with no declared access, and the HEAD Fastify mirrors from it, as undefined", async () => {
    const inventoryApp = Fastify();
    registerRouteAccess(inventoryApp);
    inventoryApp.get("/undeclared", async () => "ok");
    await inventoryApp.ready();

    expect(inventoryApp.routeAccessInventory()).toEqual([
      { method: "GET", url: "/undeclared", access: undefined },
      { method: "HEAD", url: "/undeclared", access: undefined },
    ]);

    await inventoryApp.close();
  });

  it("enforces the mirrored HEAD of a GET the same as the GET", async () => {
    const response = await app.inject({ method: "HEAD", url: "/test-only/open-session" });

    expect(response.statusCode).toBe(401);
  });
});
