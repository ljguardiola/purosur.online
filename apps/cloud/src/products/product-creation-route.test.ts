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
import { registerProductCreationRoute } from "./product-creation-route.js";

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
  registerProductCreationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertProductWithBarcode(categoryId: string, code: string): Promise<void> {
  const [product] = await db
    .insert(products)
    .values({ name: "Existing", categoryId, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  await db.insert(productBarcodes).values({ productId: product.id, code, position: 0 });
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function createProduct(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/products",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /products", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createProduct(undefined, { name: "Maceta" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(
      rawSessionId,
      { name: "Maceta", categoryId, saleUnit: "UNIT", barcodes: ["111"] },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a user without the products and categories permission with 403 forbidden, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("creates the product for a user holding the products and categories permission, trimming name and codes", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "  Maceta 20cm  ",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["  222  ", "111"],
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: body.id,
      name: "Maceta 20cm",
      categoryId,
      categoryName: "Macetas",
      saleUnit: "UNIT",
      barcodes: ["222", "111"],
      netContent: null,
      active: true,
      version: 1,
    });
    const created = await db.select().from(products).where(eq(products.id, body.id));
    expect(created).toMatchObject([{ name: "Maceta 20cm", categoryId, saleUnit: "UNIT" }]);
    const codes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, body.id))
      .orderBy(productBarcodes.position);
    expect(codes.map((row) => row.code)).toEqual(["222", "111"]);
  });

  it("creates the product for an Administrator even without the explicit permission", async () => {
    const categoryId = await insertCategory("Macetas");
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

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Maceta" });
  });

  it("rejects an empty name, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "   ",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a name longer than 100 characters, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "a".repeat(101),
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a missing categoryId, creating nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "categoryId" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a categoryId that does not name an existing category, creating nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId: "00000000-0000-0000-0000-000000000000",
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "categoryId" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a malformed categoryId, creating nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId: "not-a-uuid",
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "categoryId" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a missing saleUnit, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "saleUnit" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects missing barcodes, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "barcodes" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects more than 20 barcodes, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: Array.from({ length: 21 }, (_, index) => `code-${index}`),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "barcodes" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a repeated barcode inside the same request, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111", "111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "barcodes" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a barcode already used by another product, creating nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    await insertProductWithBarcode(categoryId, "999");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111", "999"],
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "barcode_taken", codes: ["999"] });
    expect(await db.select().from(products)).toHaveLength(1);
  });

  it("creates the product with a net content", async () => {
    const categoryId = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Alpiste",
      categoryId,
      saleUnit: "KG",
      barcodes: ["111"],
      netContent: { quantity: 1.5, unit: "KG" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ netContent: { quantity: 1.5, unit: "KG" } });
    const created = await db.select().from(products).where(eq(products.id, response.json().id));
    expect(created).toMatchObject([{ netContentQuantity: 1.5, netContentUnit: "KG" }]);
  });

  it("creates the product with no net content when the field is absent", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ netContent: null });
  });

  it("rejects a net content quantity with more than 3 decimals, creating nothing", async () => {
    const categoryId = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Alpiste",
      categoryId,
      saleUnit: "KG",
      barcodes: ["111"],
      netContent: { quantity: 1.2345, unit: "KG" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "netContentQuantity" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("rejects a net content missing its unit, creating nothing", async () => {
    const categoryId = await insertCategory("Semillas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Alpiste",
      categoryId,
      saleUnit: "KG",
      barcodes: ["111"],
      netContent: { quantity: 1.5 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "netContent" }],
    });
    expect(await db.select().from(products)).toHaveLength(0);
  });

  it("accepts a barcode held only by an inactive product's barcode", async () => {
    const categoryId = await insertCategory("Macetas");
    await insertProductWithBarcode(categoryId, "999");
    await db.update(products).set({ active: false });
    await db.update(productBarcodes).set({ active: false });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await createProduct(rawSessionId, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["999"],
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ barcodes: ["999"] });
  });
});
