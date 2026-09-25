import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { categories, rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerCategoryCreationRoute } from "./category-creation-route.js";

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
  registerCategoryCreationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function createCategory(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/categories",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /categories", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createCategory(undefined, { name: "Semillas" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createCategory(
      rawSessionId,
      { name: "Semillas" },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(categories)).toHaveLength(0);
  });

  it("rejects a user without the products and categories permission with 403 forbidden, creating nothing", async () => {
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await createCategory(rawSessionId, { name: "Semillas" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(categories)).toHaveLength(0);
  });

  it("creates the category for a user holding the products and categories permission", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createCategory(rawSessionId, { name: "  Semillas  " });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({ id: body.id, name: "Semillas", version: 1 });
    const created = await db.select().from(categories).where(eq(categories.id, body.id));
    expect(created).toMatchObject([{ name: "Semillas", version: 1 }]);
  });

  it("creates the category for an Administrator even without the explicit permission", async () => {
    const [administratorRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!administratorRole) {
      throw new Error("test setup: no Administrator role seeded");
    }
    const userId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: administratorRole.id,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(userId);

    const response = await createCategory(rawSessionId, { name: "Semillas" });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Semillas" });
  });

  it("rejects an empty name, creating nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createCategory(rawSessionId, { name: "   " });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    expect(await db.select().from(categories)).toHaveLength(0);
  });

  it("rejects a name already taken, case-insensitively, creating nothing", async () => {
    await db.insert(categories).values({ name: "Semillas" });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createCategory(rawSessionId, { name: "SEMILLAS" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "category_name_taken" });
    expect(await db.select().from(categories)).toHaveLength(1);
  });
});
