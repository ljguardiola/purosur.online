import {
  LABELS_MAX_COUNT_PER_PRODUCT as SHARED_LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT as SHARED_LABELS_MAX_TOTAL_COUNT,
} from "@purosur/contracts";
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
import {
  MAX_LABEL_COUNT_PER_PRODUCT,
  MAX_TOTAL_LABEL_COUNT,
  registerProductLabelsRoute,
} from "./products-labels-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const INTERNAL_BARCODE = "2000000000015";
const ANOTHER_INTERNAL_BARCODE = "2000000000022";

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
  registerProductLabelsRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

function requestLabels(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/products/labels",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /products/labels", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await requestLabels(undefined, { labels: [] });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, {
      labels: [{ productId, count: 1 }],
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(
      rawSessionId,
      { labels: [] },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects an empty label list", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, { labels: [] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "labels" }],
    });
  });

  it("rejects a repeated productId in the same request", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, {
      labels: [
        { productId, count: 1 },
        { productId, count: 2 },
      ],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "labels" }],
    });
  });

  it("rejects the same productId sent twice in different letter cases", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, {
      labels: [
        { productId, count: 1 },
        { productId: productId.toUpperCase(), count: 2 },
      ],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "labels" }],
    });
  });

  it("finds an existing product by its id written in uppercase", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, {
      labels: [{ productId: productId.toUpperCase(), count: 1 }],
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a count outside 1..999", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const tooLow = await requestLabels(rawSessionId, { labels: [{ productId, count: 0 }] });
    const tooHigh = await requestLabels(rawSessionId, { labels: [{ productId, count: 1000 }] });

    expect(tooLow.statusCode).toBe(400);
    expect(tooLow.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "labels" }],
    });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "labels" }],
    });
  });

  it("rejects a total label count over 2400", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, {
      labels: [
        { productId, count: 999 },
        { productId: "00000000-0000-0000-0000-000000000001", count: 999 },
        { productId: "00000000-0000-0000-0000-000000000002", count: 999 },
      ],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "labels" }],
    });
  });

  it("rejects a productId that does not name an existing product", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, {
      labels: [{ productId: "00000000-0000-0000-0000-000000000000", count: 1 }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "product_not_found",
      productId: "00000000-0000-0000-0000-000000000000",
    });
  });

  it("rejects an inactive product's id exactly the way an unknown id is rejected", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: [INTERNAL_BARCODE],
    });
    await db.update(products).set({ active: false }).where(eq(products.id, productId));
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, { labels: [{ productId, count: 1 }] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "product_not_found", productId });
  });

  it("rejects a product with no internal barcode", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: ["7790987000010"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, { labels: [{ productId, count: 1 }] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "product_without_internal_barcode",
      productId,
    });
  });

  it("uses the first internal barcode in position order, ignoring a manufacturer barcode", async () => {
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct({
      name: "Almendras",
      categoryId,
      barcodes: ["7790987000010", INTERNAL_BARCODE],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await requestLabels(rawSessionId, { labels: [{ productId, count: 1 }] });

    expect(response.statusCode).toBe(200);
  });

  it("returns a printable PDF carrying each product's name and internal barcode", async () => {
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

    const response = await requestLabels(rawSessionId, {
      labels: [
        { productId, count: 2 },
        { productId: otherProductId, count: 1 },
      ],
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    // The downloaded file's name comes from the backoffice's own message catalog.
    expect(response.headers["content-disposition"]).toBe("attachment");
    const pdf = response.rawPayload;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("label count limits", () => {
  it("mirror the shared contract's limits", () => {
    expect(MAX_LABEL_COUNT_PER_PRODUCT).toBe(SHARED_LABELS_MAX_COUNT_PER_PRODUCT);
    expect(MAX_TOTAL_LABEL_COUNT).toBe(SHARED_LABELS_MAX_TOTAL_COUNT);
  });
});
