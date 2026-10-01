import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  branchSettings,
  categories,
  priceReviews,
  prices,
  products,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { registerPricesListRoute } from "./prices-list-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let currentNow = NOON;
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
  currentNow = NOON;
  app = Fastify();
  registerPricesListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => currentNow });
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
    createdAt: currentNow,
    lastSeenAt: currentNow,
  });
  return rawSessionId;
}

async function insertCategory(name: string, parentId: string | null = null): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name, parentId })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

async function insertProduct(name: string, categoryId: string): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({ name, categoryId, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

async function insertPrice(
  productId: string,
  priceListId: string,
  unitPrice: number,
  validFrom: Date,
  id?: string,
): Promise<string> {
  const [price] = await db
    .insert(prices)
    .values({ ...(id !== undefined ? { id } : {}), productId, priceListId, unitPrice, validFrom })
    .returning({ id: prices.id });
  if (!price) {
    throw new Error("test setup: seeding the price returned no row");
  }
  return price.id;
}

async function insertReview(
  productId: string,
  priceListId: string,
  priceId: string,
  actorId: string,
  reviewedAt: Date,
): Promise<void> {
  await db.insert(priceReviews).values({ productId, priceListId, priceId, actorId, reviewedAt });
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function listPricesRequest(
  rawSessionId: string | undefined,
  query: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const search = new URLSearchParams(query).toString();
  return app.inject({
    method: "GET",
    url: search ? `/prices?${search}` : "/prices",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
  });
}

describe("GET /prices", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await listPricesRequest(undefined);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await listPricesRequest(
      rawSessionId,
      {},
      { origin: "https://attacker.example" },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without manage_prices_and_review with 403 forbidden", async () => {
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await listPricesRequest(rawSessionId);
    expect(response.statusCode).toBe(403);
  });

  it("rejects a user who only has the promotions permission with 403 forbidden", async () => {
    const userId = await insertUserWithPermission(["manage_promotions"]);
    const rawSessionId = await insertSession(userId);

    const response = await listPricesRequest(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers with the reader's products in the contract's shape, dates as ISO strings", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const productId = await insertProduct("Arroz", categoryId);
    const reviewedAt = new Date(NOON.getTime() - 3 * DAY_MS);
    const priceId = await insertPrice(productId, priceListId, 500, reviewedAt);
    await insertReview(productId, priceListId, priceId, userId, reviewedAt);
    await db
      .update(branchSettings)
      .set({ unreviewedPriceAlertDays: 45 })
      .where(eq(branchSettings.locationId, await seededLocationId(db)));

    const response = await listPricesRequest(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        {
          id: productId,
          name: "Arroz",
          categoryId,
          categoryName: "Almacén",
          saleUnit: "UNIT",
          currentPrice: { id: priceId, unitPrice: 500, validFrom: reviewedAt.toISOString() },
          daysSinceReview: 3,
          pending: false,
        },
      ],
      categories: [{ id: categoryId, name: "Almacén" }],
      pendingCount: 0,
      activeProductCount: 1,
      reviewWindowDays: 45,
    });
  });

  it("hands the review, category and search filters to the reader", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const groceries = await insertCategory("Almacén");
    const cleaning = await insertCategory("Limpieza");
    const priceListId = await seededPriceListId(db);
    const riceId = await insertProduct("Arroz", groceries);
    const noodlesId = await insertProduct("Fideos", groceries);
    await insertProduct("Detergente", cleaning);
    await insertReview(
      noodlesId,
      priceListId,
      await insertPrice(noodlesId, priceListId, 300, NOON),
      userId,
      NOON,
    );

    const idsFor = async (query: Record<string, string>) =>
      (await listPricesRequest(rawSessionId, query))
        .json()
        .products.map((product: { id: string }) => product.id);

    expect(await idsFor({ review: "pending", categoryId: groceries })).toEqual([riceId]);
    expect(await idsFor({ search: "fid" })).toEqual([noodlesId]);
  });

  it("ignores a review filter it does not know, a category id that is not an id and a blank search", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const productId = await insertProduct("Arroz", categoryId);
    const priceListId = await seededPriceListId(db);
    await insertReview(
      productId,
      priceListId,
      await insertPrice(productId, priceListId, 500, NOON),
      userId,
      NOON,
    );

    const response = await listPricesRequest(rawSessionId, {
      review: "everything",
      categoryId: "not-an-id",
      search: "   ",
    });

    expect(response.json().products.map((product: { id: string }) => product.id)).toEqual([
      productId,
    ]);
  });

  it("shows a price reviewed 23 hours earlier as reviewed today and not pending, across Argentine midnight", async () => {
    currentNow = new Date("2026-01-05T01:30:00.000Z");
    const reviewedAt = new Date("2026-01-04T02:30:00.000Z");
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);
    const productId = await insertProduct("Arroz", categoryId);
    await insertReview(
      productId,
      priceListId,
      await insertPrice(productId, priceListId, 500, reviewedAt),
      userId,
      reviewedAt,
    );

    const response = await listPricesRequest(rawSessionId);

    expect(response.json().products).toMatchObject([{ daysSinceReview: 0, pending: false }]);
  });
});
