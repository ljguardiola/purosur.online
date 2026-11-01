import { purchaseOrderDetailSchema, purchaseOrderListSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseOrderLines, purchaseOrders } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzlePurchaseOrderStore } from "./drizzle-purchase-order-store.js";
import { registerPurchaseOrdersRoutes } from "./purchase-orders-routes.js";
import { insertOfferedProduct } from "./test-support/purchase-order-fixtures.js";
import { insertProduct } from "./test-support/purchasing-fixtures.js";
import { insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

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
  registerPurchaseOrdersRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

const orderer = () => signedInWith(db, ["manage_purchase_orders"], NOW);

async function draftOf(userId: string, locationId: string, packages = 2) {
  const offered = await insertOfferedProduct(db, {
    actorId: userId,
    name: "Yerba",
    quantity: 6_000,
    priceCents: 12_000,
  });
  const built = await new DrizzlePurchaseOrderStore(db).transaction(async (tx) => {
    const { id } = await tx.insertDraftPurchaseOrder({
      supplierId: offered.supplierId,
      locationId,
      createdAt: NOW,
      actorId: userId,
    });
    await tx.insertPurchaseOrderLine({
      purchaseOrderId: id,
      position: 1,
      productId: offered.productId,
      packages,
      quantityPerPackage: 6_000,
      expectedPackagePriceCents: 12_000,
    });
    return id;
  });
  return { orderId: built, ...offered };
}

const WRITES = [
  { method: "POST", url: "/purchase-orders", payload: { choices: [] } },
  {
    method: "PUT",
    url: `/purchase-orders/${MISSING_ID}/lines`,
    payload: { lines: [] },
  },
  { method: "POST", url: `/purchase-orders/${MISSING_ID}/cancel`, payload: {} },
] as const;

const READS = [
  { method: "GET", url: "/purchase-orders" },
  { method: "GET", url: `/purchase-orders/${MISSING_ID}` },
] as const;

describe("the purchase order routes' access", () => {
  it.each([...READS, ...WRITES])("$method $url answers 401 without a session", async (request) => {
    const response = await app.inject({
      ...request,
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it.each([...READS, ...WRITES])(
    "$method $url answers 403 to a user without the purchase orders permission",
    async (request) => {
      const { headers } = await signedInWith(db, ["compare_prices_and_suggest_orders"], NOW);

      const response = await app.inject({ ...request, headers });

      expect(response.statusCode).toBe(403);
    },
  );

  it.each(WRITES)("$method $url refuses a foreign Origin, changing nothing", async (request) => {
    const { headers, userId, locationId } = await orderer();
    const { orderId } = await draftOf(userId, locationId);

    const response = await app.inject({
      ...request,
      url: request.url.replace(MISSING_ID, orderId),
      headers: { ...headers, origin: "https://elsewhere.example" },
    });

    expect(response.statusCode).toBe(403);
    const [order] = await db.select().from(purchaseOrders);
    expect(order?.state).toBe("DRAFT");
  });
});

describe("GET /purchase-orders", () => {
  it("lists the branch's orders with their state and expected total", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId, supplierId } = await draftOf(userId, locationId, 3);

    const response = await app.inject({ method: "GET", url: "/purchase-orders", headers });

    expect(response.statusCode).toBe(200);
    expect(purchaseOrderListSchema.parse(response.json())).toEqual([
      {
        id: orderId,
        supplier: { id: supplierId, name: expect.any(String) },
        state: "DRAFT",
        createdAt: NOW.toISOString(),
        lineCount: 1,
        expectedTotalCents: 36_000,
        hasUnpricedLine: false,
      },
    ]);
  });

  it("lists only the orders in the state asked for, and refuses a state that is not one", async () => {
    const { headers, userId, locationId } = await orderer();
    await draftOf(userId, locationId);

    const cancelled = await app.inject({
      method: "GET",
      url: "/purchase-orders?state=CANCELLED",
      headers,
    });
    const unknown = await app.inject({
      method: "GET",
      url: "/purchase-orders?state=LOST",
      headers,
    });

    expect(cancelled.json()).toEqual([]);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /purchase-orders/:id", () => {
  it("answers the order with its lines", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId, productId } = await draftOf(userId, locationId);

    const response = await app.inject({
      method: "GET",
      url: `/purchase-orders/${orderId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseOrderDetailSchema.parse(response.json())).toMatchObject({
      id: orderId,
      state: "DRAFT",
      lines: [{ product: { id: productId }, packages: 2, quantityPerPackage: 6_000 }],
    });
  });

  it("answers 404 to an order that does not exist or belongs to another branch", async () => {
    const { headers, userId } = await orderer();
    const otherLocationId = await insertLocation(db);
    const { orderId } = await draftOf(userId, otherLocationId);

    const unknown = await app.inject({
      method: "GET",
      url: `/purchase-orders/${MISSING_ID}`,
      headers,
    });
    const foreign = await app.inject({
      method: "GET",
      url: `/purchase-orders/${orderId}`,
      headers,
    });

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: "purchase_order_not_found" });
    expect(foreign.statusCode).toBe(404);
  });

  it("answers 400 to an id that is not a record id", async () => {
    const { headers } = await orderer();

    const response = await app.inject({ method: "GET", url: "/purchase-orders/nope", headers });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /purchase-orders", () => {
  it("builds one draft per supplier from the choices and answers 201 with their ids", async () => {
    const { headers, userId, locationId } = await orderer();
    const first = await insertOfferedProduct(db, {
      actorId: userId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const second = await insertOfferedProduct(db, {
      actorId: userId,
      name: "Azúcar",
      quantity: 10_000,
      priceCents: 8_000,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      headers,
      payload: {
        choices: [
          { ...first, packages: 2 },
          { ...second, packages: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const { orderIds } = response.json();
    const stored = await db.select().from(purchaseOrders);
    expect(orderIds.sort()).toEqual(stored.map((order) => order.id).sort());
    expect(stored.every((order) => order.locationId === locationId)).toBe(true);
    expect(stored.every((order) => order.actorId === userId)).toBe(true);
  });

  it("answers 400 to a body that is not the build shape, storing nothing", async () => {
    const { headers } = await orderer();

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      headers,
      payload: { choices: [{ productId: "x", supplierId: "y", packages: 1 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(await db.select().from(purchaseOrders)).toEqual([]);
  });

  it("answers 400 to no choices", async () => {
    const { headers } = await orderer();

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      headers,
      payload: { choices: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("answers 400 to the same product twice for one supplier", async () => {
    const { headers, userId } = await orderer();
    const offered = await insertOfferedProduct(db, {
      actorId: userId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });

    const response = await app.inject({
      method: "POST",
      url: "/purchase-orders",
      headers,
      payload: {
        choices: [
          { ...offered, packages: 1 },
          { ...offered, packages: 2 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    expect(await db.select().from(purchaseOrders)).toEqual([]);
  });

  it("answers 409 when the supplier is deactivated, the product is not purchasable or the supplier has no offer", async () => {
    const { headers, userId } = await orderer();
    const offered = await insertOfferedProduct(db, {
      actorId: userId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const inactiveSupplier = await insertSupplier(db, { actorId: userId, active: false });
    const inactiveProduct = await insertProduct(db, { name: "Mate", active: false });
    const unofferedProduct = await insertProduct(db, { name: "Bombilla" });
    const build = (choice: object) =>
      app.inject({
        method: "POST",
        url: "/purchase-orders",
        headers,
        payload: { choices: [choice] },
      });

    const supplier = await build({ ...offered, supplierId: inactiveSupplier, packages: 1 });
    const product = await build({ ...offered, productId: inactiveProduct.id, packages: 1 });
    const offer = await build({ ...offered, productId: unofferedProduct.id, packages: 1 });

    expect(supplier.statusCode).toBe(409);
    expect(supplier.json()).toMatchObject({ code: "supplier_not_purchasable" });
    expect(product.statusCode).toBe(409);
    expect(product.json()).toMatchObject({ code: "product_not_purchasable" });
    expect(offer.statusCode).toBe(409);
    expect(offer.json()).toMatchObject({ code: "offer_unavailable" });
    expect(await db.select().from(purchaseOrders)).toEqual([]);
  });
});

describe("PUT /purchase-orders/:id/lines", () => {
  it("replaces the lines of a draft and answers 200 with the order", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId, productId } = await draftOf(userId, locationId);

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-orders/${orderId}/lines`,
      headers,
      payload: { lines: [{ productId, packages: 7, quantityPerPackage: 6_000 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseOrderDetailSchema.parse(response.json()).lines).toMatchObject([{ packages: 7 }]);
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
    expect(lines.map((line) => line.packages)).toEqual([7]);
  });

  it("answers 404 to an order that does not exist or belongs to another branch", async () => {
    const { headers, userId } = await orderer();
    const otherLocationId = await insertLocation(db);
    const { orderId, productId } = await draftOf(userId, otherLocationId);
    const edit = (id: string) =>
      app.inject({
        method: "PUT",
        url: `/purchase-orders/${id}/lines`,
        headers,
        payload: { lines: [{ productId, packages: 1, quantityPerPackage: 6_000 }] },
      });

    const unknown = await edit(MISSING_ID);
    const foreign = await edit(orderId);

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: "purchase_order_not_found" });
    expect(foreign.statusCode).toBe(404);
  });

  it("answers 409 to an order that is no longer a draft", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId, productId } = await draftOf(userId, locationId);
    await db
      .update(purchaseOrders)
      .set({ state: "CANCELLED", cancelledAt: NOW, cancelledBy: userId })
      .where(eq(purchaseOrders.id, orderId));

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-orders/${orderId}/lines`,
      headers,
      payload: { lines: [{ productId, packages: 1, quantityPerPackage: 6_000 }] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchase_order_not_editable" });
  });

  it.each([
    ["no lines", () => []],
    [
      "a product twice",
      (productId: string) =>
        [1, 2].map((packages) => ({ productId, packages, quantityPerPackage: 6_000 })),
    ],
    [
      "a quantity per package a unit product cannot take",
      (productId: string) => [{ productId, packages: 1, quantityPerPackage: 1_500 }],
    ],
  ])("answers 400 to %s, leaving the lines as they were", async (_name, lines) => {
    const { headers, userId, locationId } = await orderer();
    const { orderId, productId } = await draftOf(userId, locationId);

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-orders/${orderId}/lines`,
      headers,
      payload: { lines: lines(productId) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    const stored = await db.select().from(purchaseOrderLines);
    expect(stored.map((line) => line.packages)).toEqual([2]);
  });

  it("answers 409 when a line's product is not purchasable", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId } = await draftOf(userId, locationId);
    const inactive = await insertProduct(db, { name: "Mate", active: false });

    const response = await app.inject({
      method: "PUT",
      url: `/purchase-orders/${orderId}/lines`,
      headers,
      payload: { lines: [{ productId: inactive.id, packages: 1, quantityPerPackage: 1_000 }] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "product_not_purchasable" });
  });
});

describe("POST /purchase-orders/:id/cancel", () => {
  it("cancels a draft, recording who did it, and answers 200 with the order", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId } = await draftOf(userId, locationId);

    const response = await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/cancel`,
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseOrderDetailSchema.parse(response.json()).state).toBe("CANCELLED");
    const [order] = await db.select().from(purchaseOrders);
    expect(order).toMatchObject({ state: "CANCELLED", cancelledAt: NOW, cancelledBy: userId });
  });

  it("answers 404 to an order that does not exist or belongs to another branch", async () => {
    const { headers, userId } = await orderer();
    const otherLocationId = await insertLocation(db);
    const { orderId } = await draftOf(userId, otherLocationId);
    const cancel = (id: string) =>
      app.inject({ method: "POST", url: `/purchase-orders/${id}/cancel`, headers, payload: {} });

    const unknown = await cancel(MISSING_ID);
    const foreign = await cancel(orderId);

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ code: "purchase_order_not_found" });
    expect(foreign.statusCode).toBe(404);
    const [order] = await db.select().from(purchaseOrders);
    expect(order?.state).toBe("DRAFT");
  });

  it("answers 409 to an order already cancelled", async () => {
    const { headers, userId, locationId } = await orderer();
    const { orderId } = await draftOf(userId, locationId);
    const cancel = () =>
      app.inject({
        method: "POST",
        url: `/purchase-orders/${orderId}/cancel`,
        headers,
        payload: {},
      });
    await cancel();

    const response = await cancel();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchase_order_not_cancellable" });
  });
});
