import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  branchSettings,
  categories,
  priceLists,
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
import { registerPricesListRoute } from "./prices-list-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

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
  registerPricesListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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
): Promise<string> {
  const [price] = await db
    .insert(prices)
    .values({ productId, priceListId, unitPrice, validFrom })
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

  it("reports the branch's own unreviewed-price window as reviewWindowDays", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    await db
      .update(branchSettings)
      .set({ unreviewedPriceAlertDays: 45 })
      .where(eq(branchSettings.locationId, await seededLocationId(db)));

    const response = await listPricesRequest(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json().reviewWindowDays).toBe(45);
  });

  it("hands a role holding only manage_prices_and_review every category to filter by, by name", async () => {
    const userId = await insertUserWithPermission(["manage_prices_and_review"]);
    const rawSessionId = await insertSession(userId);
    const cleaning = await insertCategory("Limpieza");
    const groceries = await insertCategory("Almacén");

    const response = await listPricesRequest(rawSessionId, { review: "pending" });

    expect(response.statusCode).toBe(200);
    expect(response.json().categories).toEqual([
      { id: groceries, name: "Almacén" },
      { id: cleaning, name: "Limpieza" },
    ]);
  });

  it("excludes a parent category from the filter, since a product can never be assigned to it", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const parent = await insertCategory("Almacén");
    const leaf = await insertCategory("Fiambres", parent);

    const response = await listPricesRequest(rawSessionId, { review: "pending" });

    expect(response.statusCode).toBe(200);
    expect(response.json().categories).toEqual([{ id: leaf, name: "Almacén › Fiambres" }]);
  });

  it("lists a never-priced product ahead of every reviewed one, as having no price", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    const reviewedProductId = await insertProduct("Arroz", categoryId);
    const staleReviewedAt = new Date(NOON.getTime() - 40 * DAY_MS);
    const reviewedPriceId = await insertPrice(reviewedProductId, priceListId, 500, staleReviewedAt);
    await insertReview(reviewedProductId, priceListId, reviewedPriceId, userId, staleReviewedAt);

    const neverPricedProductId = await insertProduct("Fideos", categoryId);

    const response = await listPricesRequest(rawSessionId, { review: "pending" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.products.map((product: { id: string }) => product.id)).toEqual([
      neverPricedProductId,
      reviewedProductId,
    ]);
    expect(body.products[0]).toMatchObject({ currentPrice: null, lastReviewedAt: null });
  });

  it("orders pending products from the oldest review to the most recent", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    // 40 days unreviewed alert window is set below; both are past it, so both are pending.
    const olderProductId = await insertProduct("Yerba", categoryId);
    const olderPriceId = await insertPrice(
      olderProductId,
      priceListId,
      500,
      new Date(NOON.getTime() - 90 * DAY_MS),
    );
    await insertReview(
      olderProductId,
      priceListId,
      olderPriceId,
      userId,
      new Date(NOON.getTime() - 90 * DAY_MS),
    );

    const newerProductId = await insertProduct("Azúcar", categoryId);
    const newerPriceId = await insertPrice(
      newerProductId,
      priceListId,
      300,
      new Date(NOON.getTime() - 60 * DAY_MS),
    );
    await insertReview(
      newerProductId,
      priceListId,
      newerPriceId,
      userId,
      new Date(NOON.getTime() - 60 * DAY_MS),
    );

    await db
      .update(branchSettings)
      .set({ unreviewedPriceAlertDays: 30 })
      .where(eq(branchSettings.locationId, await seededLocationId(db)));

    const response = await listPricesRequest(rawSessionId, { review: "pending" });
    const body = response.json();
    expect(body.products.map((product: { id: string }) => product.id)).toEqual([
      olderProductId,
      newerProductId,
    ]);
  });

  it("excludes a recently reviewed product from the pending filter", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    const productId = await insertProduct("Café", categoryId);
    const priceId = await insertPrice(productId, priceListId, 500, NOON);
    await insertReview(productId, priceListId, priceId, userId, NOON);

    const response = await listPricesRequest(rawSessionId, { review: "pending" });
    expect(response.json().products).toEqual([]);
  });

  it("takes the unreviewed window from the branch's own settings", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    const productId = await insertProduct("Café", categoryId);
    const priceId = await insertPrice(
      productId,
      priceListId,
      500,
      new Date(NOON.getTime() - 10 * DAY_MS),
    );
    await insertReview(
      productId,
      priceListId,
      priceId,
      userId,
      new Date(NOON.getTime() - 10 * DAY_MS),
    );

    await db
      .update(branchSettings)
      .set({ unreviewedPriceAlertDays: 5 })
      .where(eq(branchSettings.locationId, await seededLocationId(db)));

    const response = await listPricesRequest(rawSessionId, { review: "pending" });
    expect(response.json().products.map((product: { id: string }) => product.id)).toEqual([
      productId,
    ]);
  });

  it("filters by category and by name search", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const groceries = await insertCategory("Almacén");
    const cleaning = await insertCategory("Limpieza");

    const riceId = await insertProduct("Arroz", groceries);
    await insertProduct("Detergente", cleaning);

    const byCategory = await listPricesRequest(rawSessionId, {
      review: "all",
      categoryId: groceries,
    });
    expect(byCategory.json().products.map((product: { id: string }) => product.id)).toEqual([
      riceId,
    ]);

    const bySearch = await listPricesRequest(rawSessionId, { review: "all", search: "arr" });
    expect(bySearch.json().products.map((product: { id: string }) => product.id)).toEqual([riceId]);
  });

  it("reports the pending count regardless of the active filter", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    await insertProduct("Fideos", categoryId);
    const reviewedProductId = await insertProduct("Arroz", categoryId);
    const priceId = await insertPrice(reviewedProductId, priceListId, 500, NOON);
    await insertReview(reviewedProductId, priceListId, priceId, userId, NOON);

    const response = await listPricesRequest(rawSessionId, {
      review: "all",
      categoryId: "00000000-0000-0000-0000-000000000000",
    });
    expect(response.json().pendingCount).toBe(1);
  });

  it("leaves a deactivated product out of the list and its pending count", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const activeId = await insertProduct("Fideos", categoryId);
    const inactiveId = await insertProduct("Arroz", categoryId);
    await db.update(products).set({ active: false }).where(eq(products.id, inactiveId));

    const response = await listPricesRequest(rawSessionId, { review: "all" });

    expect(response.statusCode).toBe(200);
    const ids = response.json().products.map((product: { id: string }) => product.id);
    expect(ids).toEqual([activeId]);
    expect(response.json().pendingCount).toBe(1);
  });

  it("shows each product's newest price and newest review, whatever older history it has", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    const riceId = await insertProduct("Arroz", categoryId);
    const oldest = new Date(NOON.getTime() - 90 * DAY_MS);
    const older = new Date(NOON.getTime() - 60 * DAY_MS);
    const newest = new Date(NOON.getTime() - 10 * DAY_MS);
    const oldestPriceId = await insertPrice(riceId, priceListId, 300, oldest);
    await insertReview(riceId, priceListId, oldestPriceId, userId, oldest);
    const newestPriceId = await insertPrice(riceId, priceListId, 800, newest);
    const olderPriceId = await insertPrice(riceId, priceListId, 500, older);
    await insertReview(riceId, priceListId, newestPriceId, userId, newest);
    await insertReview(riceId, priceListId, olderPriceId, userId, older);

    const noodlesId = await insertProduct("Fideos", categoryId);
    const noodlesPriceId = await insertPrice(noodlesId, priceListId, 200, oldest);
    await insertReview(noodlesId, priceListId, noodlesPriceId, userId, oldest);

    const response = await listPricesRequest(rawSessionId, { review: "all" });

    expect(response.json().products).toMatchObject([
      {
        id: riceId,
        currentPrice: { id: newestPriceId, unitPrice: 800, validFrom: newest.toISOString() },
        lastReviewedAt: newest.toISOString(),
      },
      {
        id: noodlesId,
        currentPrice: { id: noodlesPriceId, unitPrice: 200, validFrom: oldest.toISOString() },
        lastReviewedAt: oldest.toISOString(),
      },
    ]);
  });

  it("shows a product's newest price even when it starts later than the request's own clock", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");
    const priceListId = await seededPriceListId(db);

    const productId = await insertProduct("Arroz", categoryId);
    await insertPrice(productId, priceListId, 500, new Date(NOON.getTime() - DAY_MS));
    const aheadOfNoon = new Date(NOON.getTime() + 5000);
    const newestPriceId = await insertPrice(productId, priceListId, 800, aheadOfNoon);

    const response = await listPricesRequest(rawSessionId, { review: "all" });
    const [product] = response.json().products;
    expect(product).toMatchObject({
      currentPrice: { id: newestPriceId, unitPrice: 800, validFrom: aheadOfNoon.toISOString() },
    });
  });

  it("only counts prices and reviews on the branch's own price list", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);
    const categoryId = await insertCategory("Almacén");

    const [otherPriceList] = await db
      .insert(priceLists)
      .values({ name: "Lista mayorista" })
      .returning({ id: priceLists.id });
    if (!otherPriceList) {
      throw new Error("test setup: seeding the other price list returned no row");
    }

    const productId = await insertProduct("Arroz", categoryId);
    const otherListPriceId = await insertPrice(productId, otherPriceList.id, 999, NOON);
    await insertReview(productId, otherPriceList.id, otherListPriceId, userId, NOON);

    const response = await listPricesRequest(rawSessionId, { review: "all" });
    const [product] = response.json().products;
    expect(product).toMatchObject({ currentPrice: null, lastReviewedAt: null });
  });
});
