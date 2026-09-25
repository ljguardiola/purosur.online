import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { locations, rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRoleReadRoute } from "./role-read-route.js";

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
  registerRoleReadRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertRole(name: string, permissionKeys: string[] = []): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
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

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function getRole(id: string, rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: `/roles/${id}`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
    },
  });
}

describe("GET /roles/:id", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const roleId = await insertRole("Cajera");

    const response = await getRole(roleId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const roleId = await insertRole("Cajera");

    const response = await app.inject({
      method: "GET",
      url: `/roles/${roleId}`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden", async () => {
    const cashierRoleId = await insertRole("Cajera");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getRole(cashierRoleId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the identical 404 for the Administrator role, a missing id, and a malformed one", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const administratorResponse = await getRole(await seededAdministratorRoleId(), rawSessionId);
    const missingResponse = await getRole("00000000-0000-0000-0000-000000000000", rawSessionId);
    const malformedResponse = await getRole("not-a-uuid", rawSessionId);

    expect(administratorResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(administratorResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("returns the role's name, permissions in catalog order, user count, and version", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);
    const cashierRoleId = await insertRole("Cajera", ["adjust_stock", "sell_and_charge"]);
    const graceId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId,
    });

    const response = await getRole(cashierRoleId, rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: cashierRoleId,
      name: "Cajera",
      is_administrator: false,
      permissions: ["sell_and_charge", "adjust_stock"],
      user_count: 1,
      version: 1,
      assigned_users: [{ id: graceId, name: "Grace Hopper" }],
    });
  });

  it("orders the assigned people by name and answers an empty list for nobody assigned", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);
    const cashierRoleId = await insertRole("Cajera");
    const zoeId = await insertUser({
      firstName: "Zoe Almeida",
      email: "zoe@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const amaraId = await insertUser({
      firstName: "Amara Ortiz",
      email: "amara@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const emptyRoleId = await insertRole("Depósito");

    const response = await getRole(cashierRoleId, rawSessionId);
    const emptyResponse = await getRole(emptyRoleId, rawSessionId);

    expect(response.json()).toMatchObject({
      assigned_users: [
        { id: amaraId, name: "Amara Ortiz" },
        { id: zoeId, name: "Zoe Almeida" },
      ],
    });
    expect(emptyResponse.json()).toMatchObject({ assigned_users: [] });
  });

  it("never includes a person assigned to the role at a different branch", async () => {
    const administratorId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other branch returned no row");
    }
    const cashierRoleId = await insertRole("Cajera");
    await insertUser({
      firstName: "Someone Else",
      email: "someone@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });

    const response = await getRole(cashierRoleId, rawSessionId);

    expect(response.json()).toMatchObject({ assigned_users: [] });
  });
});
