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
import { registerProductEditRoute } from "./product-edit-route.js";

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
  registerProductEditRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function editProduct(
  rawSessionId: string | undefined,
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/products/${id}/edit`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /products/:id/edit", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    const response = await editProduct(undefined, product.id, {
      name: "Maceta 20cm",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: product.version,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(
      rawSessionId,
      product.id,
      {
        name: "Maceta 20cm",
        categoryId,
        saleUnit: "UNIT",
        barcodes: ["111"],
        version: product.version,
      },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
    expect(unchanged).toMatchObject({ name: "Maceta" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "Maceta 20cm",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: product.version,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
    expect(unchanged).toMatchObject({ name: "Maceta" });
  });

  it("edits the product for a user holding the products and categories permission, replacing its barcodes", async () => {
    const categoryId = await insertCategory("Macetas");
    const otherCategoryId = await insertCategory("Semillas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111", "222"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "  Maceta 20cm  ",
      categoryId: otherCategoryId,
      saleUnit: "KG",
      barcodes: ["333"],
      version: product.version,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: product.id,
      name: "Maceta 20cm",
      categoryId: otherCategoryId,
      categoryName: "Semillas",
      saleUnit: "KG",
      barcodes: ["333"],
      version: 2,
    });
    const codes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, product.id));
    expect(codes.map((row) => row.code)).toEqual(["333"]);
  });

  it("allows a product to keep one of its own codes", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111", "222"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: product.version,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ barcodes: ["111"] });
  });

  it("returns 404 not_found for an id that does not exist, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, "00000000-0000-0000-0000-000000000000", {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: 1,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns 404 not_found for a malformed id, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, "not-a-uuid", {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: 1,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("rejects an empty name, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "   ",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: product.version,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
    expect(unchanged).toMatchObject({ name: "Maceta", version: 1 });
  });

  it("rejects a categoryId that does not name an existing category, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "Maceta",
      categoryId: "00000000-0000-0000-0000-000000000000",
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: product.version,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "categoryId" }],
    });
    const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
    expect(unchanged).toMatchObject({ name: "Maceta", categoryId, version: 1 });
  });

  it("rejects a missing or non-positive-integer version, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "version" }],
    });
  });

  it("returns 409 stale_version for a save made over a version someone else already changed", async () => {
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await editProduct(rawSessionId, product.id, {
      name: "Maceta 20cm",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
      version: product.version + 1,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [unchanged] = await db.select().from(products).where(eq(products.id, product.id));
    expect(unchanged).toMatchObject({ name: "Maceta", version: 1 });
  });

  it("rejects a barcode already used by another product, changing nothing", async () => {
    const categoryId = await insertCategory("Macetas");
    const other = await insertProduct({
      name: "Other",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["999"],
    });
    const product = await insertProduct({
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["111"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    void other;

    const response = await editProduct(rawSessionId, product.id, {
      name: "Maceta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["999"],
      version: product.version,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "barcode_taken", codes: ["999"] });
    const codes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, product.id));
    expect(codes.map((row) => row.code)).toEqual(["111"]);
  });
});
