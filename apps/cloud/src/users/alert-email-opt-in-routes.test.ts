import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  locations,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerAlertEmailOptInRoutes } from "./alert-email-opt-in-routes.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const EARLIER = new Date("2026-01-01T09:00:00.000Z");
const STALE = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1);

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let locationId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
  app = Fastify();
  registerAlertEmailOptInRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

async function roleId(administrator: boolean): Promise<string> {
  if (administrator) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!role) {
      throw new Error("test setup: no Administrator role seeded");
    }
    return role.id;
  }
  const [role] = await db
    .insert(roles)
    .values({ name: "Cajera", isAdministrator: false })
    .onConflictDoNothing()
    .returning({ id: roles.id });
  const found =
    role ?? (await db.select({ id: roles.id }).from(roles).where(eq(roles.name, "Cajera")))[0];
  if (!found) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return found.id;
}

async function insertUser(
  input: { administrator?: boolean; locationId?: string; optedInAt?: Date; active?: boolean } = {},
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lucero",
      email: `${crypto.randomUUID()}@example.com`,
      locationId: input.locationId ?? locationId,
      active: input.active ?? true,
      alertEmailOptedInAt: input.optedInAt ?? null,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: await roleId(input.administrator ?? false),
  });
  return user.id;
}

async function insertSession(userId: string, authorizedAt: Date | null = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

function request(
  method: "GET" | "PUT" | "DELETE",
  url: string,
  rawSessionId?: string,
  origin: string | undefined = BACKOFFICE_ORIGIN,
) {
  return app.inject({
    method,
    url,
    headers: {
      ...(origin ? { origin } : {}),
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
    },
  });
}

async function storedOptIn(userId: string): Promise<Date | null | undefined> {
  const [row] = await db
    .select({ at: users.alertEmailOptedInAt })
    .from(users)
    .where(eq(users.id, userId));
  return row?.at;
}

async function recordedRows() {
  return {
    audit: await db.select().from(auditLog).where(eq(auditLog.entity, "user")),
    alerts: await db.select().from(alerts).where(eq(alerts.kind, "alert_recipients_changed")),
  };
}

describe("GET /account/alert-email-opt-in", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await request("GET", "/account/alert-email-opt-in");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("answers since when the session's user receives alerts by email", async () => {
    const userId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "GET",
      "/account/alert-email-opt-in",
      await insertSession(userId),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opted_in_at: "2026-01-01T09:00:00.000Z" });
  });

  it("answers no moment for a user who does not receive them, with no authorization needed", async () => {
    const userId = await insertUser();

    const response = await request(
      "GET",
      "/account/alert-email-opt-in",
      await insertSession(userId, null),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opted_in_at: null });
  });
});

describe("PUT /account/alert-email-opt-in", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await request("PUT", "/account/alert-email-opt-in");

    expect(response.statusCode).toBe(401);
  });

  it("rejects a request from another origin with 403 origin_rejected, changing nothing", async () => {
    const userId = await insertUser();

    const response = await request(
      "PUT",
      "/account/alert-email-opt-in",
      await insertSession(userId),
      "https://attacker.example",
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedOptIn(userId)).toBeNull();
  });

  it("records the opt-in, answers its moment, audits it and opens the changed recipient set alert", async () => {
    const userId = await insertUser();

    const response = await request(
      "PUT",
      "/account/alert-email-opt-in",
      await insertSession(userId),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opted_in_at: "2026-01-05T12:00:00.000Z" });
    expect(await storedOptIn(userId)).toEqual(NOON);
    const rows = await recordedRows();
    expect(rows.audit).toMatchObject([
      {
        entityId: userId,
        actorId: userId,
        previousValue: { alertEmailOptedInAt: null },
        newValue: { alertEmailOptedInAt: "2026-01-05T12:00:00.000Z" },
      },
    ]);
    expect(rows.alerts).toMatchObject([
      { scope: userId, detail: { change: "opted_in", actorId: userId } },
    ]);
  });

  it("answers the stored moment and writes nothing when the opt-in was already recorded", async () => {
    const userId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "PUT",
      "/account/alert-email-opt-in",
      await insertSession(userId),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opted_in_at: "2026-01-01T09:00:00.000Z" });
    expect(await storedOptIn(userId)).toEqual(EARLIER);
    expect(await recordedRows()).toEqual({ audit: [], alerts: [] });
  });

  it.each([
    ["stale", STALE],
    ["missing", null],
  ])(
    "answers 401 authorization_required when the session's authorization is %s, changing nothing",
    async (_name, authorizedAt) => {
      const userId = await insertUser();

      const response = await request(
        "PUT",
        "/account/alert-email-opt-in",
        await insertSession(userId, authorizedAt),
      );

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      expect(await storedOptIn(userId)).toBeNull();
      expect(await recordedRows()).toEqual({ audit: [], alerts: [] });
    },
  );
});

describe("DELETE /account/alert-email-opt-in", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await request("DELETE", "/account/alert-email-opt-in");

    expect(response.statusCode).toBe(401);
  });

  it("rejects a request from another origin with 403 origin_rejected, changing nothing", async () => {
    const userId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      "/account/alert-email-opt-in",
      await insertSession(userId),
      "https://attacker.example",
    );

    expect(response.statusCode).toBe(403);
    expect(await storedOptIn(userId)).toEqual(EARLIER);
  });

  it("withdraws the opt-in, answers its absence, audits it and opens the changed recipient set alert", async () => {
    const userId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      "/account/alert-email-opt-in",
      await insertSession(userId),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opted_in_at: null });
    expect(await storedOptIn(userId)).toBeNull();
    const rows = await recordedRows();
    expect(rows.audit).toMatchObject([
      {
        entityId: userId,
        actorId: userId,
        previousValue: { alertEmailOptedInAt: "2026-01-01T09:00:00.000Z" },
        newValue: { alertEmailOptedInAt: null },
      },
    ]);
    expect(rows.alerts).toMatchObject([
      { scope: userId, detail: { change: "withdrawn", actorId: userId } },
    ]);
  });

  it("answers 200 and writes nothing when there was no opt-in", async () => {
    const userId = await insertUser();

    const response = await request(
      "DELETE",
      "/account/alert-email-opt-in",
      await insertSession(userId),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ opted_in_at: null });
    expect(await recordedRows()).toEqual({ audit: [], alerts: [] });
  });

  it("answers 401 authorization_required when the session's authorization is stale, changing nothing", async () => {
    const userId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      "/account/alert-email-opt-in",
      await insertSession(userId, STALE),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await storedOptIn(userId)).toEqual(EARLIER);
  });
});

describe("DELETE /users/:id/alert-email-opt-in", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await request("DELETE", `/users/${crypto.randomUUID()}/alert-email-opt-in`);

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user who cannot manage users with 403 forbidden, changing nothing", async () => {
    const actorId = await insertUser();
    const targetId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      `/users/${targetId}/alert-email-opt-in`,
      await insertSession(actorId),
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedOptIn(targetId)).toEqual(EARLIER);
  });

  it("rejects a request from another origin with 403 origin_rejected, changing nothing", async () => {
    const administratorId = await insertUser({ administrator: true });
    const targetId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      `/users/${targetId}/alert-email-opt-in`,
      await insertSession(administratorId),
      "https://attacker.example",
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedOptIn(targetId)).toEqual(EARLIER);
  });

  it("withdraws another user's opt-in, audits it by the Administrator and opens the changed recipient set alert", async () => {
    const administratorId = await insertUser({ administrator: true });
    const targetId = await insertUser({ optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      `/users/${targetId}/alert-email-opt-in`,
      await insertSession(administratorId),
    );

    expect(response.statusCode).toBe(200);
    expect(await storedOptIn(targetId)).toBeNull();
    const rows = await recordedRows();
    expect(rows.audit).toMatchObject([
      { entityId: targetId, actorId: administratorId, newValue: { alertEmailOptedInAt: null } },
    ]);
    expect(rows.alerts).toMatchObject([
      { scope: targetId, detail: { change: "withdrawn", actorId: administratorId } },
    ]);
  });

  it("answers 200 and writes nothing when the other user had no opt-in", async () => {
    const administratorId = await insertUser({ administrator: true });
    const targetId = await insertUser();

    const response = await request(
      "DELETE",
      `/users/${targetId}/alert-email-opt-in`,
      await insertSession(administratorId),
    );

    expect(response.statusCode).toBe(200);
    expect(await recordedRows()).toEqual({ audit: [], alerts: [] });
  });

  it("answers 403 own_account for the Administrator's own user, changing nothing", async () => {
    const administratorId = await insertUser({ administrator: true, optedInAt: EARLIER });

    const response = await request(
      "DELETE",
      `/users/${administratorId}/alert-email-opt-in`,
      await insertSession(administratorId),
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "own_account" });
    expect(await storedOptIn(administratorId)).toEqual(EARLIER);
  });

  it.each([
    ["an unknown user", async () => crypto.randomUUID()],
    ["a deactivated user", async () => insertUser({ active: false, optedInAt: EARLIER })],
    [
      "a user of another branch",
      async () => {
        const [other] = await db.insert(locations).values({}).returning({ id: locations.id });
        if (!other) {
          throw new Error("test setup: seeding the location returned no row");
        }
        return insertUser({ locationId: other.id, optedInAt: EARLIER });
      },
    ],
  ])("answers 404 not_found for %s", async (_name, target) => {
    const administratorId = await insertUser({ administrator: true });
    const targetId = await target();

    const response = await request(
      "DELETE",
      `/users/${targetId}/alert-email-opt-in`,
      await insertSession(administratorId),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await recordedRows()).toEqual({ audit: [], alerts: [] });
  });

  it("answers 401 authorization_required, not 404, for an unknown user when the authorization is stale", async () => {
    const administratorId = await insertUser({ administrator: true });

    const response = await request(
      "DELETE",
      `/users/${crypto.randomUUID()}/alert-email-opt-in`,
      await insertSession(administratorId, STALE),
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
  });

  it("answers 400 validation_failed for an id that is not a record id", async () => {
    const administratorId = await insertUser({ administrator: true });

    const response = await request(
      "DELETE",
      "/users/not-an-id/alert-email-opt-in",
      await insertSession(administratorId),
    );

    expect(response.statusCode).toBe(400);
  });
});

describe("recording another user's opt-in", () => {
  it("has no route for it", async () => {
    const administratorId = await insertUser({ administrator: true });
    const targetId = await insertUser();

    const response = await request(
      "PUT",
      `/users/${targetId}/alert-email-opt-in`,
      await insertSession(administratorId),
    );

    expect(response.statusCode).toBe(404);
    expect(await storedOptIn(targetId)).toBeNull();
  });
});
