import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { sessions, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerSessionReadRoute } from "./session-read-route.js";

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
    .values({ firstName: "Ada Lovelace", email: "ada@example.com" })
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
    url: "/users/session",
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

describe("GET /users/session", () => {
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

  it("returns the signed-in user's id and name for a live session", async () => {
    const rawSessionId = await insertSession();

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user_id: userId, display_name: "Ada Lovelace" });
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
    currentTime = new Date(NOON.getTime() + THIRTY_MINUTES_MS);

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it("does not expire a session just under the 30-minute idle threshold", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + THIRTY_MINUTES_MS - 1);

    const response = await getSession(rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("expires and revokes a session open for 12 hours, even with recent activity", async () => {
    currentTime = new Date(NOON.getTime() + TWELVE_HOURS_MS);
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
    currentTime = new Date(NOON.getTime() + TWELVE_HOURS_MS - 1);
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
      url: "/users/session",
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

  it("accepts the backoffice's own Origin", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "GET",
      url: "/users/session",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: BACKOFFICE_ORIGIN,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a request the browser reports as cross-site, leaving last_seen_at untouched", async () => {
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    const response = await app.inject({
      method: "GET",
      url: "/users/session",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        "sec-fetch-site": "cross-site",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const row = await sessionRow(rawSessionId);
    expect(row?.lastSeenAt.getTime()).toBe(NOON.getTime());
  });

  it("rejects a request the browser reports as started by the person, revoking nothing", async () => {
    const rawSessionId = await insertSession({ createdAt: NOON, lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + THIRTY_MINUTES_MS);

    const response = await app.inject({
      method: "GET",
      url: "/users/session",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        "sec-fetch-site": "none",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const row = await sessionRow(rawSessionId);
    expect(row?.revokedAt).toBeNull();
  });

  it("accepts the same-origin fetch the backoffice itself makes, and refreshes the session", async () => {
    const rawSessionId = await insertSession({ lastSeenAt: NOON });
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    const response = await app.inject({
      method: "GET",
      url: "/users/session",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        "sec-fetch-site": "same-origin",
      },
    });

    expect(response.statusCode).toBe(200);
    const row = await sessionRow(rawSessionId);
    expect(row?.lastSeenAt.getTime()).toBe(currentTime.getTime());
  });
});
