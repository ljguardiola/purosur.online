import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  categories,
  productBarcodes,
  products,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerProductsListRoute } from "./products-list-route.js";

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
  registerProductsListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertCategory(name: string): Promise<string> {
  const [category] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

async function insertProduct(input: {
  name: string;
  categoryId: string;
  saleUnit: "UNIT" | "KG";
  barcodes: string[];
}): Promise<{ id: string; version: number }> {
  const [product] = await db
    .insert(products)
    .values({ name: input.name, categoryId: input.categoryId, saleUnit: input.saleUnit })
    .returning({ id: products.id, version: products.version });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  await db
    .insert(productBarcodes)
    .values(input.barcodes.map((code, position) => ({ productId: product.id, code, position })));
  return product;
}

function getProducts(rawSessionId?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/products",
    headers: {
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

describe("GET /products", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getProducts();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists products by name with their category and barcodes in insertion order", async () => {
    const macetasId = await insertCategory("Macetas");
    const semillasId = await insertCategory("Semillas");
    const maceta = await insertProduct({
      name: "Maceta 20cm",
      categoryId: macetasId,
      saleUnit: "UNIT",
      barcodes: ["222", "111"],
    });
    const semilla = await insertProduct({
      name: "Alpiste 1kg",
      categoryId: semillasId,
      saleUnit: "KG",
      barcodes: ["333"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: semilla.id,
        name: "Alpiste 1kg",
        categoryId: semillasId,
        categoryName: "Semillas",
        saleUnit: "KG",
        barcodes: ["333"],
        version: semilla.version,
      },
      {
        id: maceta.id,
        name: "Maceta 20cm",
        categoryId: macetasId,
        categoryName: "Macetas",
        saleUnit: "UNIT",
        barcodes: ["222", "111"],
        version: maceta.version,
      },
    ]);
  });

  it("lists products for an Administrator even without the explicit permission", async () => {
    const categoryId = await insertCategory("Semillas");
    await insertProduct({ name: "Alpiste", categoryId, saleUnit: "KG", barcodes: ["1"] });
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

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ name: "Alpiste" }]);
  });
});
