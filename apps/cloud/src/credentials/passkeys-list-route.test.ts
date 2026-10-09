import { BACKOFFICE_REQUEST_WINDOW_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  exhaustSessionRateLimit,
  exhaustSourceAddressRateLimit,
  INJECTED_SOURCE_ADDRESS,
} from "../access/test-support/exhaust-backoffice-rate-limit.js";
import { passkeys, sessions, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerPasskeysListRoute } from "./passkeys-list-route.js";

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
  registerPasskeysListRoute(app, {
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

async function insertPasskey(overrides: {
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
  forUserId?: string;
}): Promise<string> {
  const [row] = await db
    .insert(passkeys)
    .values({
      userId: overrides.forUserId ?? userId,
      credentialId: `credential-${overrides.name}`,
      publicKey: "cHVibGljLWtleQ",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      name: overrides.name,
      createdAt: overrides.createdAt,
      ...(overrides.lastUsedAt ? { lastUsedAt: overrides.lastUsedAt } : {}),
    })
    .returning({ id: passkeys.id });
  if (!row) {
    throw new Error("test setup: seeding the passkey returned no row");
  }
  return row.id;
}

function getPasskeys(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/account/passkeys",
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

describe("GET /account/passkeys", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getPasskeys();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the cookie's session is unknown", async () => {
    const response = await getPasskeys(generateSessionId());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("lists only the session account's passkeys, ordered by created_at", async () => {
    const rawSessionId = await insertSession();
    const [strangerUser] = await db
      .insert(users)
      .values({
        firstName: "Grace Hopper",
        email: "grace@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!strangerUser) {
      throw new Error("test setup: seeding the stranger user returned no row");
    }
    await insertPasskey({ name: "Del extraño", createdAt: NOON, forUserId: strangerUser.id });
    const olderId = await insertPasskey({ name: "Notebook", createdAt: NOON });
    const newerId = await insertPasskey({
      name: "Teléfono",
      createdAt: new Date(NOON.getTime() + 1000),
      lastUsedAt: new Date(NOON.getTime() + 2000),
    });

    const response = await getPasskeys(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: olderId,
        name: "Notebook",
        created_at: NOON.toISOString(),
        last_used_at: null,
      },
      {
        id: newerId,
        name: "Teléfono",
        created_at: new Date(NOON.getTime() + 1000).toISOString(),
        last_used_at: new Date(NOON.getTime() + 2000).toISOString(),
      },
    ]);
  });

  it("touches last_seen_at, the same as GET /sessions/current", async () => {
    const rawSessionId = await insertSession();
    currentTime = new Date(NOON.getTime() + 5 * 60 * 1000);

    await getPasskeys(rawSessionId);

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.lastSeenAt.getTime()).toBe(currentTime.getTime());
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession();

    const response = await app.inject({
      method: "GET",
      url: "/account/passkeys",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("returns 429 rate_limited with Retry-After once the session is over its backoffice request limit, leaving last_seen_at untouched", async () => {
    const rawSessionId = await insertSession();
    await exhaustSessionRateLimit(db, rawSessionId, NOON);

    const response = await getPasskeys(rawSessionId);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "rate_limited" });
    expect(response.headers["retry-after"]).toBe(String(BACKOFFICE_REQUEST_WINDOW_MS / 1000));
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(row?.lastSeenAt.getTime()).toBe(NOON.getTime());
  });

  it("still answers 401 to a request with no open session while its source address is over its limit", async () => {
    await exhaustSourceAddressRateLimit(db, INJECTED_SOURCE_ADDRESS, NOON);

    const response = await getPasskeys(generateSessionId());

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });
});
