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
import { registerProductDeactivationRoute } from "./product-deactivation-route.js";

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
  registerProductDeactivationRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
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
  barcodes: string[];
}): Promise<{ id: string; version: number }> {
  const [product] = await db
    .insert(products)
    .values({ name: input.name, categoryId: input.categoryId, saleUnit: "UNIT" })
    .returning({ id: products.id, version: products.version });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  if (input.barcodes.length > 0) {
    await db
      .insert(productBarcodes)
      .values(input.barcodes.map((code, position) => ({ productId: product.id, code, position })));
  }
  return product;
}

function deactivateProduct(
  targetId: string,
  rawSessionId: string | undefined,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/products/${targetId}/deactivation`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

describe("POST /products/:id/deactivation", () => {
  let categoryId: string;
  let targetId: string;

  beforeEach(async () => {
    categoryId = await insertCategory("Macetas");
    const product = await insertProduct({
      name: "Maceta 20cm",
      categoryId,
      barcodes: ["111", "222"],
    });
    targetId = product.id;
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await deactivateProduct(targetId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await deactivateProduct(targetId, rawSessionId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const [row] = await db.select().from(products).where(eq(products.id, targetId));
    expect(row?.active).toBe(true);
  });

  it("rejects a user without the manage_products_and_categories permission with 403 forbidden, changing nothing", async () => {
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await deactivateProduct(targetId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(products).where(eq(products.id, targetId));
    expect(row?.active).toBe(true);
  });

  it("answers the identical 404 for a missing id and a malformed one", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const missingResponse = await deactivateProduct(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );
    const malformedResponse = await deactivateProduct("not-a-uuid", rawSessionId);

    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("answers not_found for a target already inactive, changing nothing", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    await db.update(products).set({ active: false }).where(eq(products.id, targetId));

    const response = await deactivateProduct(targetId, rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("deactivates the product, bumps its version, and deactivates its barcodes", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await deactivateProduct(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(products).where(eq(products.id, targetId));
    expect(row?.active).toBe(false);
    expect(row?.version).toBe(2);
    const barcodeRows = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, targetId));
    expect(barcodeRows).toHaveLength(2);
    for (const barcodeRow of barcodeRows) {
      expect(barcodeRow.active).toBe(false);
    }
  });
});

describe("a raw DELETE FROM products", () => {
  it("fails against the database, whoever sends it", async () => {
    // No barcodes, so the trigger this proves is the one rejecting it: `product_barcodes`'s own
    // foreign key (`ON DELETE no action`) would already block deleting a product that still has
    // any.
    const categoryId = await insertCategory("Macetas");
    const product = await insertProduct({ name: "Maceta", categoryId, barcodes: [] });

    await expect(
      testDatabase.client.query(`delete from "products" where "id" = '${product.id}'`),
    ).rejects.toThrow(/products are never deleted, only deactivated/);

    const [row] = await db.select().from(products).where(eq(products.id, product.id));
    expect(row).toBeDefined();
  });
});
