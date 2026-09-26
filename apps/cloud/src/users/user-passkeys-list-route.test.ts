import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { locations, passkeys, roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserPasskeysListRoute } from "./user-passkeys-list-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

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
  registerUserPasskeysListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertCashierRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: input.firstName, email: input.email, locationId: input.locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
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
  forUserId: string;
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
}): Promise<string> {
  const [row] = await db
    .insert(passkeys)
    .values({
      userId: overrides.forUserId,
      credentialId: `credential-${overrides.name}-${overrides.forUserId}`,
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

function getUserPasskeys(targetId: string, rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: `/users/${targetId}/passkeys`,
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

describe("GET /users/:id/passkeys", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getUserPasskeys("00000000-0000-0000-0000-000000000000");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a non-Administrator with 403 forbidden", async () => {
    const locationId = await seededLocationId(db);
    const cashierRoleId = await insertCashierRole("Cajera");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getUserPasskeys(cashierId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the target's passkeys, ordered by created_at, in the same row shape Mi cuenta uses", async () => {
    const locationId = await seededLocationId(db);
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    const cashierRoleId = await insertCashierRole("Cajera");
    const targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const olderId = await insertPasskey({ forUserId: targetId, name: "Notebook", createdAt: NOON });
    const newerId = await insertPasskey({
      forUserId: targetId,
      name: "Teléfono",
      createdAt: new Date(NOON.getTime() + 1000),
      lastUsedAt: new Date(NOON.getTime() + 2000),
    });
    await insertPasskey({ forUserId: administratorId, name: "Del admin", createdAt: NOON });
    const rawSessionId = await insertSession(administratorId);

    const response = await getUserPasskeys(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: olderId, name: "Notebook", created_at: NOON.toISOString(), last_used_at: null },
      {
        id: newerId,
        name: "Teléfono",
        created_at: new Date(NOON.getTime() + 1000).toISOString(),
        last_used_at: new Date(NOON.getTime() + 2000).toISOString(),
      },
    ]);
  });

  it("answers the identical 404 for another branch's target id, a missing one, and a malformed one", async () => {
    const locationId = await seededLocationId(db);
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    const rawSessionId = await insertSession(administratorId);
    const cashierRoleId = await insertCashierRole("Cajera");
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const strangerId = await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });

    const crossBranchResponse = await getUserPasskeys(strangerId, rawSessionId);
    const missingResponse = await getUserPasskeys(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );
    const malformedResponse = await getUserPasskeys("not-a-uuid", rawSessionId);

    expect(crossBranchResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(crossBranchResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("lists a deactivated target's passkeys", async () => {
    const locationId = await seededLocationId(db);
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    const rawSessionId = await insertSession(administratorId);
    const targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: await insertCashierRole("Cajera"),
      locationId,
    });
    const passkeyId = await insertPasskey({
      forUserId: targetId,
      name: "Notebook",
      createdAt: NOON,
    });
    await db.update(users).set({ active: false }).where(eq(users.id, targetId));

    const response = await getUserPasskeys(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: passkeyId, name: "Notebook", created_at: NOON.toISOString(), last_used_at: null },
    ]);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const locationId = await seededLocationId(db);
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "GET",
      url: `/users/${administratorId}/passkeys`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });
});
