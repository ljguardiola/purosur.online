import { currentZoneRulesSchema } from "@purosur/contracts";
import { publishZoneRules } from "@purosur/domain/register/use-cases";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerCurrentZoneRulesRoute } from "./current-zone-rules-route.js";
import { DrizzleZoneRulesStore } from "./drizzle-zone-rules-store.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let userId: string;

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
      firstName: "Ana",
      email: "ana@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  userId = user.id;

  app = Fastify();
  registerCurrentZoneRulesRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertSession(revokedAt?: Date): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    ...(revokedAt ? { revokedAt } : {}),
  });
  return rawSessionId;
}

function publish(version: string, offsetMinutes: number) {
  return publishZoneRules(
    { store: new DrizzleZoneRulesStore(db) },
    {
      version,
      transitions: [
        { from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 },
        { from: new Date("2030-03-01T03:00:00.000Z"), offsetMinutes },
      ],
    },
  );
}

function getCurrentZoneRules(rawSessionId?: string, origin: string = BACKOFFICE_ORIGIN) {
  return app.inject({
    method: "GET",
    url: "/zone-rules/current",
    headers: {
      origin,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
    },
  });
}

describe("GET /zone-rules/current", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getCurrentZoneRules();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 401 unauthenticated when the session was revoked", async () => {
    const rawSessionId = await insertSession(NOON);

    const response = await getCurrentZoneRules(rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("refuses a request from an origin that is not the backoffice's", async () => {
    const rawSessionId = await insertSession();

    const response = await getCurrentZoneRules(rawSessionId, "https://evil.example.com");

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("answers any signed-in user with the rules published last, in a body the contracts shape accepts", async () => {
    await publish("2026a", -120);
    await publish("2026b", -60);
    const rawSessionId = await insertSession();

    const response = await getCurrentZoneRules(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(currentZoneRulesSchema.parse(response.json())).toEqual({
      version: "2026b",
      transitions: [
        { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
        { from: "2030-03-01T03:00:00.000Z", offset_minutes: -60 },
      ],
    });
  });

  it("answers 404 not_found while the cloud has published no rules", async () => {
    const rawSessionId = await insertSession();

    const response = await getCurrentZoneRules(rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });
});
