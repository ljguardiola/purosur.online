import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { registerSessionReadRoute } from "./session-read-route.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
const NOON = new Date("2026-01-05T12:00:00.000Z");
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;
let app: FastifyInstance;
let userId: string;
let currentTime: Date;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

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
  registerSessionReadRoute(app, { db, now: () => currentTime });
});

afterEach(async () => {
  await app.close();
  await client.close();
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
});
