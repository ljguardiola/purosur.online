import {
  CAPABILITIES,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from "@purosur/domain";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  backofficeRateLimitAttempts,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerSessionReadRoute } from "./session-read-route.js";
import {
  exhaustSessionRateLimit,
  exhaustSourceAddressRateLimit,
  INJECTED_SOURCE_ADDRESS,
} from "./test-support/exhaust-backoffice-rate-limit.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let userId: string;
let currentTime: Date;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("seeding the test user returned no row");
  }
  userId = user.id;

  currentTime = NOON;
  app = Fastify();
  registerSessionReadRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
});

interface InsertSessionOverrides {
  createdAt?: Date;
  lastSeenAt?: Date;
  revokedAt?: Date;
}

async function insertSession(overrides: InsertSessionOverrides = {}): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: overrides.createdAt ?? NOON,
    lastSeenAt: overrides.lastSeenAt ?? NOON,
    ...(overrides.revokedAt ? { revokedAt: overrides.revokedAt } : {}),
  });
  return rawSessionId;
}

function getSession(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/sessions/current",
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

async function sessionRow(rawSessionId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
  return row;
}

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

describe("GET /sessions/current", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getSession();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the cookie's session is unknown", async () => {
    const response = await getSession(generateSessionId());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the session was revoked", async () => {
    const rawSessionId = await insertSession({ revokedAt: NOON });

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns the signed-in user's id and name for a live session, not an Administrator", async () => {
    const rawSessionId = await insertSession();

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user_id: userId,
      display_name: "Ada Lovelace",
      expires_at: new Date(NOON.getTime() + SESSION_IDLE_TIMEOUT_MS).toISOString(),
      is_administrator: false,
      capabilities: [],
      stock_movement_kinds: [],
    });
  });

  it("returns is_administrator true for a user holding the Administrator role", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    await db.insert(userRoles).values({ userId, roleId: administratorRoleId });
    const rawSessionId = await insertSession();

    const response = await getSession(rawSessionId);

    expect(response.json()).toMatchObject({ is_administrator: true });
  });

  it("returns every capability for a user holding the Administrator role", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    await db.insert(userRoles).values({ userId, roleId: administratorRoleId });
    const rawSessionId = await insertSession();

    const response = await getSession(rawSessionId);

    expect(response.json()).toMatchObject({ capabilities: [...CAPABILITIES] });
  });

  it("returns every manual stock movement kind for a user holding the Administrator role", async () => {
    const administratorRoleId = await seededAdministratorRoleId();
    await db.insert(userRoles).values({ userId, roleId: administratorRoleId });
    const rawSessionId = await insertSession();

    const response = await getSession(rawSessionId);

    expect(response.json()).toMatchObject({ stock_movement_kinds: ["loss", "adjustment"] });
  });

  it("returns the capabilities the user's role permissions grant", async () => {
    const [stockRole] = await db
      .insert(roles)
      .values({ name: "Depósito", isAdministrator: false })
      .returning({ id: roles.id });
    if (!stockRole) {
      throw new Error("test setup: seeding the role returned no row");
    }
    await db.insert(userRoles).values({ userId, roleId: stockRole.id });
    await db.insert(rolePermissions).values([
      { roleId: stockRole.id, permissionKey: "record_stock_losses" },
      { roleId: stockRole.id, permissionKey: "sell_and_charge" },
    ]);
    const rawSessionId = await insertSession();

    const response = await getSession(rawSessionId);

    expect(response.json()).toMatchObject({
      capabilities: ["stock_losses", "stock_movements", "stock_area"],
      stock_movement_kinds: ["loss"],
    });
  });

  it("reflects a permission granted to the user's role without signing in again", async () => {
    const [stockRole] = await db
      .insert(roles)
      .values({ name: "Depósito", isAdministrator: false })
      .returning({ id: roles.id });
    if (!stockRole) {
      throw new Error("test setup: seeding the role returned no row");
    }
    await db.insert(userRoles).values({ userId, roleId: stockRole.id });
    const rawSessionId = await insertSession();

    const before = await getSession(rawSessionId);
    await db
      .insert(rolePermissions)
      .values({ roleId: stockRole.id, permissionKey: "record_stock_losses" });
    const after = await getSession(rawSessionId);

    expect(before.json()).toMatchObject({ capabilities: [] });
    expect(after.json()).toMatchObject({
      capabilities: ["stock_losses", "stock_movements", "stock_area"],
    });
  });

  it("returns expires_at computed from the touched last_seen_at, not the stale one", async () => {
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    const response = await getSession(rawSessionId);

    expect(response.json()).toMatchObject({
      expires_at: new Date(currentTime.getTime() + SESSION_IDLE_TIMEOUT_MS).toISOString(),
    });
  });

  it("touches last_seen_at on a live session", async () => {
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    await getSession(rawSessionId);

    const row = await sessionRow(rawSessionId);
    expect(row?.lastSeenAt.getTime()).toBe(currentTime.getTime());
  });

  it("expires and revokes a session idle for 30 minutes with no activity", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + SESSION_IDLE_TIMEOUT_MS);

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("does not expire a session just under the 30-minute idle threshold", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + SESSION_IDLE_TIMEOUT_MS - 1);

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("expires and revokes a session open for 12 hours, even with recent activity", async () => {
    currentTime = new Date(NOON.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);
    const rawSessionId = await insertSession({
      createdAt: NOON,
      lastSeenAt: new Date(currentTime.getTime() - 1000),
    });

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("does not expire a session just under the 12-hour absolute threshold", async () => {
    currentTime = new Date(NOON.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS - 1);
    const rawSessionId = await insertSession({
      createdAt: NOON,
      lastSeenAt: new Date(currentTime.getTime() - 1000),
    });

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("expires and revokes the session of an account that was deactivated", async () => {
    const rawSessionId = await insertSession();
    await db.update(users).set({ active: false }).where(eq(users.id, userId));

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("rejects an Origin that is not the backoffice's own, leaving last_seen_at untouched", async () => {
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    const response = await app.inject({
      method: "GET",
      url: "/sessions/current",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const row = await sessionRow(rawSessionId);
    expect(row?.lastSeenAt.getTime()).toBe(NOON.getTime());
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, leaving last_seen_at untouched", async () => {
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    await exhaustSessionRateLimit(db, rawSessionId, NOON);

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
    const row = await sessionRow(rawSessionId);
    expect(row?.lastSeenAt.getTime()).toBe(NOON.getTime());
  });

  it("counts a request under an open session once against that session and once against its source address", async () => {
    const rawSessionId = await insertSession();
    const openSession = await sessionRow(rawSessionId);

    await getSession(rawSessionId);

    const counted = await db
      .select({
        keyKind: backofficeRateLimitAttempts.keyKind,
        keyValue: backofficeRateLimitAttempts.keyValue,
      })
      .from(backofficeRateLimitAttempts);
    expect(counted).toHaveLength(2);
    expect(counted).toEqual(
      expect.arrayContaining([
        { keyKind: "session", keyValue: openSession?.id },
        { keyKind: "source_address", keyValue: INJECTED_SOURCE_ADDRESS },
      ]),
    );
  });

  it("does not count a request with no open session against any limit", async () => {
    const revoked = await insertSession({ revokedAt: NOON });
    const idle = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + SESSION_IDLE_TIMEOUT_MS);

    for (const rawSessionId of [undefined, generateSessionId(), revoked, idle]) {
      expect((await getSession(rawSessionId)).statusCode).toBe(401);
    }

    expect(await db.select().from(backofficeRateLimitAttempts)).toHaveLength(0);
  });

  it("still answers a request with no open session as before while its source address is over its limit", async () => {
    const idle = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + SESSION_IDLE_TIMEOUT_MS);
    await exhaustSourceAddressRateLimit(db, INJECTED_SOURCE_ADDRESS, currentTime);

    const withoutCookie = await getSession();
    const withIdleSession = await getSession(idle);

    expect(withoutCookie.statusCode).toBe(401);
    expect(withoutCookie.json()).toMatchObject({ code: "unauthenticated" });
    expect(withIdleSession.statusCode).toBe(401);
    const row = await sessionRow(idle);
    expect(row?.revokedAt?.getTime()).toBe(currentTime.getTime());
  });

  it("applies the source-address limit across open sessions, rejecting a fresh one from the same address", async () => {
    await exhaustSourceAddressRateLimit(db, INJECTED_SOURCE_ADDRESS, NOON);
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe(String(55 * 60));
    const row = await sessionRow(rawSessionId);
    expect(row?.lastSeenAt.getTime()).toBe(NOON.getTime());
  });

  it("reads the session once per request, so the same read decides both counting and service", async () => {
    const rawSessionId = await insertSession();
    const sessionReads: string[] = [];
    const observedDb = drizzle(testDatabase.client, {
      logger: {
        logQuery(query) {
          if (/^select\b[\s\S]*\bfrom "sessions"/i.test(query)) {
            sessionReads.push(query);
          }
        },
      },
    });
    const observedApp = Fastify();
    registerSessionReadRoute(observedApp, {
      db: observedDb,
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => currentTime,
    });

    try {
      const response = await observedApp.inject({
        method: "GET",
        url: "/sessions/current",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await observedApp.close();
    }
    expect(sessionReads).toHaveLength(1);
  });
});
