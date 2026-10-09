import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { rolePermissions, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  capabilityAccess,
  OPEN_SESSION_ACCESS,
  OPEN_SESSION_PEEK_ACCESS,
  openSessionOf,
  originGuard,
  PUBLIC_ACCESS,
  recordAccess,
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
  app.get(
    "/test-only/stock-losses-capability",
    { config: { access: capabilityAccess("stock_losses"), sessionSource } },
    answerWithSession,
  );
  app.get(
    "/test-only/stock-movements-capability",
    { config: { access: capabilityAccess("stock_movements"), sessionSource } },
    answerWithSession,
  );
  app.get(
    "/test-only/manage-users-capability",
    { config: { access: capabilityAccess("manage_users"), sessionSource } },
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
  app.get(
    "/test-only/own-record/:recordId",
    {
      config: {
        access: recordAccess("recordId", (actor, recordId) => actor.id === recordId),
        sessionSource,
      },
    },
    answerWithSession,
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
    .values({ firstName: "Grace Villalba", email, locationId: await seededLocationId(db) })
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
    const response = await callRoute("/test-only/stock-losses-capability");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("grants access to a user whose role holds the declared capability's permission", async () => {
    const roleId = await insertRole("Pérdidas", ["record_stock_losses"]);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/stock-losses-capability", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("rejects a user whose role holds no permission of the declared capability with 403 forbidden", async () => {
    const roleId = await insertRole("Pérdidas", []);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/stock-losses-capability", rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("grants a user holding any permission of a declared capability, and no other", async () => {
    const lossesRoleId = await insertRole("Pérdidas", ["record_stock_losses"]);
    const lossesSessionId = await insertSession(
      await insertUser(lossesRoleId, "losses@example.com"),
    );
    const adjustRoleId = await insertRole("Ajustes", ["adjust_stock"]);
    const adjustSessionId = await insertSession(
      await insertUser(adjustRoleId, "adjust@example.com"),
    );
    const countsRoleId = await insertRole("Conteos", ["perform_stock_counts"]);
    const countsSessionId = await insertSession(
      await insertUser(countsRoleId, "counts@example.com"),
    );
    const path = "/test-only/stock-movements-capability";

    expect((await callRoute(path, lossesSessionId)).statusCode).toBe(200);
    expect((await callRoute(path, adjustSessionId)).statusCode).toBe(200);
    const refused = await callRoute(path, countsSessionId);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: "forbidden" });
  });

  it("grants an Administrator every capability-declared route", async () => {
    const userId = await insertUser(await seededAdministratorRoleId(), "admin@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/stock-movements-capability", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("rejects a non-Administrator on a manage_users route even holding other permissions", async () => {
    const roleId = await insertRole("Cajera", ["void_sale"]);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/manage-users-capability", rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("grants an Administrator access to a manage_users route", async () => {
    const userId = await insertUser(await seededAdministratorRoleId(), "admin@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/manage-users-capability", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("grants any open session access to an open-session-declared route, permission or not", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/open-session", rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("answers 401 unauthenticated on a record route without a session", async () => {
    const response = await callRoute("/test-only/own-record/00000000-0000-4000-8000-000000000000");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    expect(handlerRuns).toBe(0);
  });

  it("answers 400 validation_failed on a record route whose id is malformed", async () => {
    const userId = await insertUser(await insertRole("Cajera", []), "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/own-record/not-an-id", rawSessionId);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "recordId" }],
    });
    expect(handlerRuns).toBe(0);
  });

  it("answers 403 forbidden on a record route when its predicate refuses the record", async () => {
    const userId = await insertUser(await insertRole("Cajera", []), "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute(
      "/test-only/own-record/00000000-0000-4000-8000-000000000000",
      rawSessionId,
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(handlerRuns).toBe(0);
  });

  it("lets a record route through when its predicate grants the record", async () => {
    const userId = await insertUser(await insertRole("Cajera", []), "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute(`/test-only/own-record/${userId}`, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user_id: userId });
  });

  it("matches a record id written in upper case against the signed-in user's own id", async () => {
    const userId = await insertUser(await insertRole("Cajera", []), "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute(`/test-only/own-record/${userId.toUpperCase()}`, rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("hands a record route's predicate the user's administrator flag and permissions", async () => {
    const roleId = await insertRole("Pérdidas", ["record_stock_losses"]);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);
    const seen: unknown[] = [];
    app.get(
      "/test-only/inspected-record/:recordId",
      {
        config: {
          access: recordAccess("recordId", (actor) => {
            seen.push(actor);
            return true;
          }),
          sessionSource: routeSessionSource({ db, now: () => NOON }),
        },
      },
      async (_request, reply) => reply.code(200).send({}),
    );
    await app.ready();

    await callRoute(`/test-only/inspected-record/${userId}`, rawSessionId);

    expect(seen).toEqual([
      { id: userId, isAdministrator: false, permissionKeys: ["record_stock_losses"] },
    ]);
  });

  it("reflects a permission granted to the user's role without signing in again", async () => {
    const roleId = await insertRole("Pérdidas", []);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);

    const before = await callRoute("/test-only/stock-losses-capability", rawSessionId);
    await db.insert(rolePermissions).values({ roleId, permissionKey: "record_stock_losses" });
    const after = await callRoute("/test-only/stock-losses-capability", rawSessionId);

    expect(before.statusCode).toBe(403);
    expect(after.statusCode).toBe(200);
  });

  it("reflects a permission removed from the user's role on the very next request", async () => {
    const roleId = await insertRole("Pérdidas", ["record_stock_losses"]);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);

    const before = await callRoute("/test-only/stock-losses-capability", rawSessionId);
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    const after = await callRoute("/test-only/stock-losses-capability", rawSessionId);

    expect(before.statusCode).toBe(200);
    expect(after.statusCode).toBe(403);
  });

  it("reads the session and its role's permissions in one database read", async () => {
    const roleId = await insertRole("Pérdidas", ["record_stock_losses"]);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);
    const query = vi.spyOn(testDatabase.client, "query");

    const response = await callRoute("/test-only/stock-losses-capability", rawSessionId);
    const statements = query.mock.calls.map(([statement]) => String(statement));
    query.mockRestore();

    expect(response.statusCode).toBe(200);
    const permissionReads = statements.filter((statement) =>
      statement.includes('"role_permissions"'),
    );
    expect(permissionReads).toHaveLength(1);
    expect(permissionReads[0]).toContain('"sessions"');
  });

  it("hands the handler the session it resolved, so the handler never resolves it again", async () => {
    const roleId = await insertRole("Cajera", []);
    const userId = await insertUser(roleId, "cashier@example.com");
    const rawSessionId = await insertSession(userId);

    const response = await callRoute("/test-only/open-session", rawSessionId);

    expect(response.json()).toEqual({ user_id: userId });
  });

  it("never runs the handler when the declared access is refused", async () => {
    const roleId = await insertRole("Pérdidas", []);
    const userId = await insertUser(roleId, "losses@example.com");
    const rawSessionId = await insertSession(userId);

    await callRoute("/test-only/open-session");
    await callRoute("/test-only/manage-users-capability", rawSessionId);
    await callRoute("/test-only/stock-losses-capability", rawSessionId);

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
    const sessionSource = routeSessionSource({ db, now: () => NOON });
    inventoryApp.get(
      "/foo",
      { config: { access: OPEN_SESSION_ACCESS, sessionSource } },
      async () => "ok",
    );
    inventoryApp.post(
      "/bar",
      { config: { access: capabilityAccess("manage_users"), sessionSource } },
      async () => "ok",
    );

    expect(inventoryApp.routeAccessInventory()).toEqual([
      { method: "GET", url: "/foo", access: OPEN_SESSION_ACCESS },
      { method: "POST", url: "/bar", access: capabilityAccess("manage_users") },
    ]);

    await inventoryApp.close();
  });

  it("reports a capability-declared route by the capability it names", async () => {
    const inventoryApp = Fastify();
    registerRouteAccess(inventoryApp);
    inventoryApp.get(
      "/movements",
      {
        config: {
          access: capabilityAccess("stock_movements"),
          sessionSource: routeSessionSource({ db, now: () => NOON }),
        },
      },
      async () => "ok",
    );

    expect(inventoryApp.routeAccessInventory()).toEqual([
      {
        method: "GET",
        url: "/movements",
        access: { level: "capability", capability: "stock_movements" },
      },
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

describe("routeSessionSource's clock", () => {
  it("is required", () => {
    expectTypeOf<{ db: PgDatabase<PgQueryResultHKT> }>().not.toExtend<
      Parameters<typeof routeSessionSource<PgQueryResultHKT>>[0]
    >();
  });
});
