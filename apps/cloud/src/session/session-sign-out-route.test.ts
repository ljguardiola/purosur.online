import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { backofficeRateLimitAttempts, sessions, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerSessionReadRoute } from "./session-read-route.js";
import { registerSessionSignOutRoute } from "./session-sign-out-route.js";

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
    .values({ firstName: "Ada Lovelace", email: "ada@example.com" })
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

function postSignOut(rawSessionId?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/users/session/sign-out",
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
    url: "/users/session",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
  });
}

/** Puts a session's own backoffice API rate limit (issue #205) already at its hourly cap. */
async function exhaustSessionRateLimit(rawSessionId: string): Promise<void> {
  await db.insert(backofficeRateLimitAttempts).values(
    Array.from({ length: 600 }, () => ({
      keyKind: "session" as const,
      keyValue: hashSessionId(rawSessionId),
      attemptedAt: NOON,
    })),
  );
}

describe("POST /users/session/sign-out", () => {
  it("revokes the session and clears the cookie", async () => {
    const rawSessionId = await insertSession();

    const response = await postSignOut(rawSessionId);

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

  it("makes the cookie it revoked no longer authenticate a later GET /users/session", async () => {
    const rawSessionId = await insertSession();

    await postSignOut(rawSessionId);
    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("is idempotent for an already-revoked session", async () => {
    const rawSessionId = await insertSession();
    const first = await postSignOut(rawSessionId);
    const firstRow = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));

    const second = await postSignOut(rawSessionId);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const secondRow = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(secondRow[0]?.revokedAt).toEqual(firstRow[0]?.revokedAt);
  });

  it("succeeds for a cookie whose session is unknown, without error", async () => {
    const response = await postSignOut(generateSessionId());

    expect(response.statusCode).toBe(200);
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await postSignOut();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a missing Origin header", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "POST",
      url: "/users/session/sign-out",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects an Origin that does not match the backoffice's own origin", async () => {
    const rawSessionId = await insertSession();

    const response = await postSignOut(rawSessionId, { origin: "https://evil.example.com" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, leaving the session unrevoked", async () => {
    const rawSessionId = await insertSession();
    await exhaustSessionRateLimit(rawSessionId);

    const response = await postSignOut(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBeDefined();
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.revokedAt).toBeNull();
  });
});
