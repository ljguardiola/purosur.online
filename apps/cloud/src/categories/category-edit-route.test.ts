import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { categories, rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerCategoryEditRoute } from "./category-edit-route.js";

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
  registerCategoryEditRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

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

async function insertUserWithPermission(
  permissionKeys: string[] = ["manage_products_and_categories"],
): Promise<string> {
  const roleId = await insertRole("Encargada", permissionKeys);
  return insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId,
    locationId: await seededLocationId(db),
  });
}

async function insertCategory(name: string): Promise<{ id: string; version: number }> {
  const [category] = await db
    .insert(categories)
    .values({ name })
    .returning({ id: categories.id, version: categories.version });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function editCategory(
  rawSessionId: string | undefined,
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/categories/${id}/edit`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /categories/:id/edit", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const category = await insertCategory("Semillas");

    const response = await editCategory(undefined, category.id, {
      name: "Macetas",
      version: category.version,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(
      rawSessionId,
      category.id,
      { name: "Macetas", version: category.version },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(unchanged).toMatchObject({ name: "Semillas" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "Macetas",
      version: category.version,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(unchanged).toMatchObject({ name: "Semillas" });
  });

  it("renames the category for a user holding the products and categories permission", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "  Macetas  ",
      version: category.version,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: category.id, name: "Macetas", version: 2 });
    const [updated] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(updated).toMatchObject({ name: "Macetas", version: 2 });
  });

  it("returns 404 not_found for an id that does not exist, changing nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, "00000000-0000-0000-0000-000000000000", {
      name: "Macetas",
      version: 1,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns 404 not_found for a malformed id, changing nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, "not-a-uuid", {
      name: "Macetas",
      version: 1,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("rejects an empty name, changing nothing", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "   ",
      version: category.version,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(unchanged).toMatchObject({ name: "Semillas", version: 1 });
  });

  it("rejects a name longer than 100 characters, changing nothing", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "a".repeat(101),
      version: category.version,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(unchanged).toMatchObject({ name: "Semillas", version: 1 });
  });

  it("rejects a missing or non-positive-integer version, changing nothing", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, { name: "Macetas" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "version" }],
    });
  });

  it("returns 409 stale_version for a save made over a version someone else already changed", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "Macetas",
      version: category.version + 1,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(unchanged).toMatchObject({ name: "Semillas", version: 1 });
  });

  it("rejects renaming to a name already taken by another category, case-insensitively, changing nothing", async () => {
    await insertCategory("Macetas");
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "MACETAS",
      version: category.version,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "category_name_taken" });
    const [unchanged] = await db.select().from(categories).where(eq(categories.id, category.id));
    expect(unchanged).toMatchObject({ name: "Semillas", version: 1 });
  });

  it("allows keeping a category's own name unchanged, as a no-op that does not bump the version", async () => {
    const category = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editCategory(rawSessionId, category.id, {
      name: "Semillas",
      version: category.version,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: category.id, name: "Semillas", version: 1 });
  });
});
