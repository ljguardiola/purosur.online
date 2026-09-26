import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { categories, rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerCategoriesListRoute } from "./categories-list-route.js";

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
  registerCategoriesListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertCategory(
  name: string,
  parentId: string | null = null,
): Promise<{ id: string; version: number }> {
  const [category] = await db
    .insert(categories)
    .values({ name, parentId })
    .returning({ id: categories.id, version: categories.version });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category;
}

function getCategories(rawSessionId?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/categories",
    headers: {
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

describe("GET /categories", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getCategories();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const roleId = await insertRole("Cajera", ["sell_and_charge"]);
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await getCategories(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists categories by name for a user holding the products and categories permission", async () => {
    const semillas = await insertCategory("Semillas");
    const macetas = await insertCategory("Macetas");
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(userId);

    const response = await getCategories(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: macetas.id, name: "Macetas", version: macetas.version, parentId: null },
      { id: semillas.id, name: "Semillas", version: semillas.version, parentId: null },
    ]);
  });

  it("returns each category's parentId, null for a top-level category", async () => {
    const almacen = await insertCategory("Almacén");
    const untables = await insertCategory("Untables", almacen.id);
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(userId);

    const response = await getCategories(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: almacen.id, parentId: null }),
        expect.objectContaining({ id: untables.id, parentId: almacen.id }),
      ]),
    );
  });

  it("lists categories for an Administrator even without the explicit permission", async () => {
    await insertCategory("Semillas");
    const userId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(userId);

    const response = await getCategories(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ name: "Semillas" }]);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      roleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(userId);

    const response = await getCategories(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });
});
