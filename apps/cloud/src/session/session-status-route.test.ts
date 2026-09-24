import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { sessions, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { exhaustSessionRateLimit } from "./exhaust-backoffice-rate-limit.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerSessionStatusRoute } from "./session-status-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

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
  registerSessionStatusRoute(app, {
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

function getStatus(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/users/session/status",
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

describe("GET /users/session/status", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getStatus();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the cookie's session is unknown", async () => {
    const response = await getStatus(generateSessionId());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the session was already revoked", async () => {
    const rawSessionId = await insertSession({ revokedAt: NOON });

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns expires_at bound by the idle timeout when it comes before the absolute one", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      expires_at: new Date(NOON.getTime() + THIRTY_MINUTES_MS).toISOString(),
    });
  });

  it("returns expires_at bound by the absolute timeout when it comes before the idle one", async () => {
    currentTime = new Date(NOON.getTime() + TWELVE_HOURS_MS - 10 * 60 * 1000);
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: currentTime });

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      expires_at: new Date(NOON.getTime() + TWELVE_HOURS_MS).toISOString(),
    });
  });

  it("does not touch last_seen_at, so a repeatedly probed session still idle-expires on schedule", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });

    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);
    await getStatus(rawSessionId);
    currentTime = new Date(NOON.getTime() + 20 * 60 * 1000);
    await getStatus(rawSessionId);

    const untouchedRow = await sessionRow(rawSessionId);
    expect(untouchedRow?.lastSeenAt.getTime()).toBe(NOON.getTime());

    currentTime = new Date(NOON.getTime() + THIRTY_MINUTES_MS);
    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const expiredRow = await sessionRow(rawSessionId);
    expect(expiredRow?.revokedAt).not.toBeNull();
  });

  it("expires and revokes a session idle for 30 minutes with no activity", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + THIRTY_MINUTES_MS);

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("expires and revokes a session open for 12 hours, even with recent activity", async () => {
    currentTime = new Date(NOON.getTime() + TWELVE_HOURS_MS);
    const rawSessionId = await insertSession({
      createdAt: NOON,
      lastSeenAt: new Date(currentTime.getTime() - 1000),
    });

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("expires and revokes the session of an account that was deactivated", async () => {
    const rawSessionId = await insertSession();
    await db.update(users).set({ active: false }).where(eq(users.id, userId));

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "GET",
      url: "/users/session/status",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("accepts the backoffice's own Origin", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "GET",
      url: "/users/session/status",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: BACKOFFICE_ORIGIN,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a request the browser reports as cross-site", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "GET",
      url: "/users/session/status",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        "sec-fetch-site": "cross-site",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited once the session is over its shared backoffice request limit", async () => {
    const rawSessionId = await insertSession();
    await exhaustSessionRateLimit(db, rawSessionId, NOON);

    const response = await getStatus(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("3600");
  });
});
