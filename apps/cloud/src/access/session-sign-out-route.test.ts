import { BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT, SESSION_IDLE_TIMEOUT_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backofficeRateLimitAttempts, sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerSessionReadRoute } from "./session-read-route.js";
import { registerSessionSignOutRoute } from "./session-sign-out-route.js";
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
  registerSessionSignOutRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  registerSessionReadRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertSession(): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

function deleteCurrentSession(rawSessionId?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "DELETE",
    url: "/sessions/current",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

function getSession(rawSessionId: string) {
  return app.inject({
    method: "GET",
    url: "/sessions/current",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
  });
}

describe("DELETE /sessions/current", () => {
  it("no longer answers the old sign-out path", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "POST",
      url: "/users/session/sign-out",
      headers: { origin: BACKOFFICE_ORIGIN, cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it("revokes the session and clears the cookie", async () => {
    const rawSessionId = await insertSession();

    const response = await deleteCurrentSession(rawSessionId);

    expect(response.statusCode).toBe(200);
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.revokedAt).not.toBeNull();
  });

  it("makes the cookie it revoked no longer authenticate a later GET /sessions/current", async () => {
    const rawSessionId = await insertSession();

    await deleteCurrentSession(rawSessionId);
    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("is idempotent for an already-revoked session", async () => {
    const rawSessionId = await insertSession();
    const first = await deleteCurrentSession(rawSessionId);
    const firstRow = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));

    const second = await deleteCurrentSession(rawSessionId);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const secondRow = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(secondRow[0]?.revokedAt).toEqual(firstRow[0]?.revokedAt);
  });

  it("succeeds for a cookie whose session is unknown, without error", async () => {
    const response = await deleteCurrentSession(generateSessionId());

    expect(response.statusCode).toBe(200);
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await deleteCurrentSession();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that does not match the backoffice's own origin", async () => {
    const rawSessionId = await insertSession();

    const response = await deleteCurrentSession(rawSessionId, {
      origin: "https://evil.example.com",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, leaving the session unrevoked", async () => {
    const rawSessionId = await insertSession();
    await exhaustSessionRateLimit(db, rawSessionId, NOON);

    const response = await deleteCurrentSession(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.revokedAt).toBeNull();
  });

  it("rejects a sign-out under an open session once its source address is over its limit", async () => {
    await exhaustSourceAddressRateLimit(db, INJECTED_SOURCE_ADDRESS, NOON);
    const rawSessionId = await insertSession();

    const response = await deleteCurrentSession(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("3600");
  });

  it("answers a sign-out with no open session as before, uncounted, while its source address is over its limit", async () => {
    const idle = await insertSession();
    currentTime = new Date(NOON.getTime() + SESSION_IDLE_TIMEOUT_MS);
    await exhaustSourceAddressRateLimit(db, INJECTED_SOURCE_ADDRESS, currentTime);

    const withoutCookie = await deleteCurrentSession();
    const withUnknownSession = await deleteCurrentSession(generateSessionId());
    const withIdleSession = await deleteCurrentSession(idle);

    expect(withoutCookie.statusCode).toBe(401);
    expect(withUnknownSession.statusCode).toBe(200);
    expect(withIdleSession.statusCode).toBe(200);
    expect(String(withIdleSession.headers["set-cookie"])).toContain(`${SESSION_COOKIE_NAME}=;`);
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(idle)));
    expect(row?.revokedAt?.getTime()).toBe(currentTime.getTime());
    expect(await db.select().from(backofficeRateLimitAttempts)).toHaveLength(
      BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
    );
  });
});
