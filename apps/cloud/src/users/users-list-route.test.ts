import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  locations,
  passkeys,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUsersListRoute } from "./users-list-route.js";

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
  registerUsersListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertCashierRole(name: string, permissionKeys: string[] = []): Promise<string> {
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

async function insertPasskey(forUserId: string, credentialId: string): Promise<void> {
  await db.insert(passkeys).values({
    userId: forUserId,
    credentialId,
    publicKey: "cHVibGljLWtleQ",
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    name: "Notebook del local",
  });
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

function getUsers(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/users",
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

describe("GET /users", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getUsers();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the deactivate_users permission with 403 forbidden", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const locationId = await seededLocationId(db);
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getUsers(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists users for a holder of deactivate_users though not an Administrator", async () => {
    const locationId = await seededLocationId(db);
    const roleId = await insertCashierRole("Encargada", ["deactivate_users"]);
    const userId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId,
      locationId,
    });
    const rawSessionId = await insertSession(userId);

    const response = await getUsers(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: userId,
        first_name: "Ada Lovelace",
        email: "ada@example.com",
        version: 1,
        role: { id: roleId, is_administrator: false, name: "Encargada" },
        passkey_count: 0,
      },
    ]);
  });

  it("excludes an inactive user from the list", async () => {
    const locationId = await seededLocationId(db);
    const administratorRoleId = await seededAdministratorRoleId();
    const cashierRoleId = await insertCashierRole("Cajera");
    const administratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: administratorRoleId,
      locationId,
    });
    const inactiveId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    await db.update(users).set({ active: false }).where(eq(users.id, inactiveId));
    const rawSessionId = await insertSession(administratorId);

    const response = await getUsers(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: administratorId,
        first_name: "Zoe Admin",
        email: "zoe@example.com",
        version: 1,
        role: { id: administratorRoleId, is_administrator: true, name: null },
        passkey_count: 0,
      },
    ]);
  });

  it("lists only the session branch's users, ordered by first name, with their role and passkey count", async () => {
    const locationId = await seededLocationId(db);
    const administratorRoleId = await seededAdministratorRoleId();
    const cashierRoleId = await insertCashierRole("Cajera");
    const administratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: administratorRoleId,
      locationId,
    });
    const cashierId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    await insertPasskey(cashierId, "cashier-credential-1");
    await insertPasskey(cashierId, "cashier-credential-2");
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getUsers(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: cashierId,
        first_name: "Ada Lovelace",
        email: "ada@example.com",
        version: 1,
        role: { id: cashierRoleId, is_administrator: false, name: "Cajera" },
        passkey_count: 2,
      },
      {
        id: administratorId,
        first_name: "Zoe Admin",
        email: "zoe@example.com",
        version: 1,
        role: { id: administratorRoleId, is_administrator: true, name: null },
        passkey_count: 0,
      },
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
      url: "/users",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });
});
