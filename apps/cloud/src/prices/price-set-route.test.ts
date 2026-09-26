import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  categories,
  priceReviews,
  prices,
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
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { registerPriceSetRoute } from "./price-set-route.js";
import { listPrices } from "./prices-list-route.js";

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
  registerPriceSetRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

async function insertUserWithPermission(
  permissionKeys: string[] = ["manage_prices_and_review"],
): Promise<string> {
  const roleId = await insertRole("Encargada", permissionKeys);
  const locationId = await seededLocationId(db);
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
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

async function insertProduct(name: string): Promise<string> {
  const [category] = await db.insert(categories).values({ name: "Almacén" }).returning({
    id: categories.id,
  });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({ name, categoryId: category.id, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

async function insertPrice(productId: string, unitPrice: number, validFrom: Date): Promise<string> {
  const priceListId = await seededPriceListId(db);
  const [price] = await db
    .insert(prices)
    .values({ productId, priceListId, unitPrice, validFrom })
    .returning({ id: prices.id });
  if (!price) {
    throw new Error("test setup: seeding the price returned no row");
  }
  return price.id;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function setPriceRequest(
  rawSessionId: string | undefined,
  productId: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/products/${productId}/price`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /products/:id/price", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const productId = await insertProduct("Arroz");
    const response = await setPriceRequest(undefined, productId, {
      unitPrice: 1000,
      expectedCurrentPriceId: null,
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");

    const response = await setPriceRequest(
      rawSessionId,
      productId,
      { unitPrice: 1000, expectedCurrentPriceId: null },
      { origin: "https://attacker.example" },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without manage_prices_and_review with 403 forbidden", async () => {
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1000,
      expectedCurrentPriceId: null,
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns 404 for a product that does not exist", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await setPriceRequest(rawSessionId, "00000000-0000-0000-0000-000000000000", {
      unitPrice: 1000,
      expectedCurrentPriceId: null,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("rejects a deactivated product's id exactly the way an unknown id is rejected", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");
    await db.update(products).set({ active: false }).where(eq(products.id, productId));

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1000,
      expectedCurrentPriceId: null,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("rejects a deactivated product as not found even before validating the body", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");
    await db.update(products).set({ active: false }).where(eq(products.id, productId));

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 0,
      expectedCurrentPriceId: "not-a-uuid",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("rejects a non-positive unit price with a validation failure", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 0,
      expectedCurrentPriceId: null,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "unitPrice" }],
    });
  });

  it("rejects a unit price above what the catalog can store with a validation failure", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 2_147_483_648,
      expectedCurrentPriceId: null,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "unitPrice" }],
    });
  });

  it("rejects a malformed expectedCurrentPriceId", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1000,
      expectedCurrentPriceId: "not-a-uuid",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "expectedCurrentPriceId" }],
    });
  });

  it("gives a never-priced product its first price, which counts as its first review", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Fideos");

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1500,
      expectedCurrentPriceId: null,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.price).toMatchObject({ unitPrice: 1500 });
    expect(new Date(body.lastReviewedAt)).toEqual(NOON);

    const [reviewRow] = await db
      .select()
      .from(priceReviews)
      .where(eq(priceReviews.productId, productId));
    expect(reviewRow).toMatchObject({ actorId: userId, priceId: body.price.id });

    const [auditRow] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "product_price"), eq(auditLog.entityId, productId)));
    expect(auditRow).toMatchObject({ actorId: userId, previousValue: null });
  });

  it("changing a price inserts a new row and leaves the previous one exactly as it was", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");
    const originalValidFrom = new Date(NOON.getTime() - 10 * 24 * 60 * 60 * 1000);
    const originalPriceId = await insertPrice(productId, 1000, originalValidFrom);

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1200,
      expectedCurrentPriceId: originalPriceId,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.price.id).not.toBe(originalPriceId);
    expect(body.price.unitPrice).toBe(1200);

    const [originalRow] = await db.select().from(prices).where(eq(prices.id, originalPriceId));
    expect(originalRow).toMatchObject({ unitPrice: 1000, validFrom: originalValidFrom });

    const allPrices = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(allPrices).toHaveLength(2);
  });

  it("treats as current the same price the prices list shows when several start at the same moment", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const priceListId = await seededPriceListId(db);
    const productId = await insertProduct("Arroz");
    const tiedPriceIds = [
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
      "00000000-0000-4000-8000-000000000000",
      "88888888-8888-4888-8888-888888888888",
    ];
    for (const [index, id] of tiedPriceIds.entries()) {
      await db
        .insert(prices)
        .values({ id, productId, priceListId, unitPrice: 1000 + index * 100, validFrom: NOON });
    }

    const listed = await listPrices(db, {
      priceListId,
      now: NOON,
      unreviewedPriceAlertDays: 30,
      review: "all",
    });
    const listedPriceId = listed.products[0]?.currentPrice?.id;
    expect(tiedPriceIds).toContain(listedPriceId);

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 5000,
      expectedCurrentPriceId: listedPriceId,
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects setting the same price as the current one", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");
    const priceId = await insertPrice(productId, 1000, NOON);

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1000,
      expectedCurrentPriceId: priceId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "price_unchanged" });
    const allPrices = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(allPrices).toHaveLength(1);
  });

  it("rejects a stale expected price id when the product already has a price", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");
    await insertPrice(productId, 1000, NOON);

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1200,
      expectedCurrentPriceId: null,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_price" });
    const allPrices = await db.select().from(prices).where(eq(prices.productId, productId));
    expect(allPrices).toHaveLength(1);
  });

  it("rejects a stale expected price id that names a price the product no longer carries", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const productId = await insertProduct("Arroz");
    await insertPrice(productId, 1000, NOON);

    const response = await setPriceRequest(rawSessionId, productId, {
      unitPrice: 1200,
      expectedCurrentPriceId: "11111111-1111-1111-1111-111111111111",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_price" });
  });
});
