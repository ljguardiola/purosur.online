import { PERMISSION_KEYS } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { locations, rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRolesListRoute } from "./roles-list-route.js";

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
  registerRolesListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

function getRoles(rawSessionId?: string) {
  return app.inject({
    method: "GET",
    url: "/roles",
    headers: rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {},
  });
}

describe("GET /roles", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getRoles();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a non-Administrator with 403 forbidden", async () => {
    const cashierRoleId = await insertRole("Cajera");
    const locationId = await seededLocationId(db);
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getRoles(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists Administrator first (with every catalog permission, a null name, and its user count), then other roles by name with their own stored permissions", async () => {
    const locationId = await seededLocationId(db);
    const administratorRoleId = await seededAdministratorRoleId();
    const stockRoleId = await insertRole("Depósito", ["view_stock_balances", "adjust_stock"]);
    const cashierRoleId = await insertRole("Cajera", ["sell_and_charge"]);
    const administratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: administratorRoleId,
      locationId,
    });
    await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    await insertUser({
      firstName: "Bea Lovelace",
      email: "bea@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getRoles(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: administratorRoleId,
        name: null,
        is_administrator: true,
        permissions: [...PERMISSION_KEYS],
        user_count: 1,
      },
      {
        id: cashierRoleId,
        name: "Cajera",
        is_administrator: false,
        permissions: ["sell_and_charge"],
        user_count: 2,
      },
      {
        id: stockRoleId,
        name: "Depósito",
        is_administrator: false,
        permissions: ["view_stock_balances", "adjust_stock"],
        user_count: 0,
      },
    ]);
  });

  it("counts a role's users across every branch, since roles are global", async () => {
    const locationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: inserting the other location returned no row");
    }
    const cashierRoleId = await insertRole("Cajera", ["sell_and_charge"]);
    const administratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    await insertUser({
      firstName: "Bea Otherbranch",
      email: "bea@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getRoles(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { is_administrator: true, user_count: 1 },
      { id: cashierRoleId, user_count: 2 },
    ]);
  });

  it("counts only active users, leaving a deactivated one out", async () => {
    const locationId = await seededLocationId(db);
    const cashierRoleId = await insertRole("Cajera", ["sell_and_charge"]);
    const administratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    const deactivatedId = await insertUser({
      firstName: "Bea Deactivated",
      email: "bea@example.com",
      roleId: cashierRoleId,
      locationId,
    });
    await db.update(users).set({ active: false }).where(eq(users.id, deactivatedId));
    const rawSessionId = await insertSession(administratorId);

    const response = await getRoles(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { is_administrator: true, user_count: 1 },
      { id: cashierRoleId, user_count: 1 },
    ]);
  });

  it("returns a role's permissions in catalog order, whatever order they were stored in", async () => {
    const locationId = await seededLocationId(db);
    const cashierRoleId = await insertRole("Cajera", [
      "adjust_stock",
      "view_stock_balances",
      "void_sale",
      "sell_and_charge",
    ]);
    const administratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId,
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await getRoles(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { is_administrator: true },
      {
        id: cashierRoleId,
        permissions: ["sell_and_charge", "void_sale", "view_stock_balances", "adjust_stock"],
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
      url: "/roles",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        origin: "https://attacker.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });
});
