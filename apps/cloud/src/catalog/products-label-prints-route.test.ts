import { gunzipSync } from "node:zlib";
import { printerLabelsSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  productBarcodes,
  products,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerProductLabelPrintsRoute } from "./products-label-prints-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const INTERNAL_BARCODE = "2000000000015";
const ANOTHER_INTERNAL_BARCODE = "2000000000022";
const SIZE = { widthMm: 50, heightMm: 30 };

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
  registerProductLabelPrintsRoute(app, {
    zoneRules: fixedZoneRulesSource(),
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
    firstName: "Ada Lucero",
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
  barcodes?: string[];
}): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({ name: input.name, categoryId: input.categoryId, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  const barcodes = input.barcodes ?? [];
  if (barcodes.length > 0) {
    await db
      .insert(productBarcodes)
      .values(barcodes.map((code, position) => ({ productId: product.id, code, position })));
  }
  return product.id;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function requestLabelPrints(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/label-prints",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

async function seedProduct(name: string, barcode: string): Promise<string> {
  const categoryId = await insertCategory("Almacén");
  return insertProduct({ name, categoryId, barcodes: [barcode] });
}

describe("POST /label-prints", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await requestLabelPrints(undefined, { labels: [], size: SIZE });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId, count: 1 }],
      size: SIZE,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(
      rawSessionId,
      { labels: [], size: SIZE },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("answers an invalid body with the validation error", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, { labels: [], size: SIZE });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "validation_failed",
      message: "labels must be a non-empty list of { productId, count }",
      details: [{ field: "labels" }],
    });
  });

  it("rejects a productId that does not name an existing product", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId: "00000000-0000-0000-0000-000000000000", count: 1 }],
      size: SIZE,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "product_not_found",
      message: "no product with that id",
      productId: "00000000-0000-0000-0000-000000000000",
    });
  });

  it("rejects an inactive product exactly the way an unknown id is rejected", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    await db.update(products).set({ active: false }).where(eq(products.id, productId));
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId, count: 1 }],
      size: SIZE,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "product_not_found", productId });
  });

  it("rejects a product with no internal barcode", async () => {
    const productId = await seedProduct("Almendras", "7790987000010");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId, count: 1 }],
      size: SIZE,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "product_without_internal_barcode",
      message: "this product has no internal barcode to print",
      productId,
    });
  });

  it("answers one raster per product with the copies asked for, as the printer labels contract", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras peladas",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const otherProductId = await insertProduct({
      name: "Nueces mariposa",
      categoryId,
      barcodes: [ANOTHER_INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [
        { productId, count: 3 },
        { productId: otherProductId, count: 1 },
      ],
      size: SIZE,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    const answer = printerLabelsSchema.parse(response.json());
    expect(answer.widthDots).toBe(400);
    expect(answer.heightDots).toBe(240);
    expect(answer.labels.map((label) => label.copies)).toEqual([3, 1]);
    expect(answer.labels[0]?.rows).not.toBe(answer.labels[1]?.rows);
  });

  it("answers the dots of the size asked for and a raster of exactly that size", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId, count: 1 }],
      size: { widthMm: 40, heightMm: 25 },
    });

    expect(response.statusCode).toBe(200);
    const answer = printerLabelsSchema.parse(response.json());
    expect(answer.widthDots).toBe(320);
    expect(answer.heightDots).toBe(200);
    expect(Buffer.from(answer.labels[0]?.rows ?? "", "base64")).toHaveLength((320 / 8) * 200);
  });

  it("rejects a size outside the printer's ranges with the validation error", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId, count: 1 }],
      size: { widthMm: 24, heightMm: 30 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "size" }],
    });
  });

  it("rejects a body without a size with the validation error", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, { labels: [{ productId, count: 1 }] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("gzips the answer for a browser that accepts it", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(
      rawSessionId,
      { labels: [{ productId, count: 2 }], size: SIZE },
      { "accept-encoding": "gzip" },
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    const answer = printerLabelsSchema.parse(
      JSON.parse(gunzipSync(response.rawPayload).toString()),
    );
    expect(answer.labels).toHaveLength(1);
    expect(answer.labels[0]?.copies).toBe(2);
  });

  it("does not gzip the answer for a client that does not accept it", async () => {
    const productId = await seedProduct("Almendras", INTERNAL_BARCODE);
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabelPrints(rawSessionId, {
      labels: [{ productId, count: 1 }],
      size: SIZE,
    });

    expect(response.headers["content-encoding"]).toBeUndefined();
  });
});
