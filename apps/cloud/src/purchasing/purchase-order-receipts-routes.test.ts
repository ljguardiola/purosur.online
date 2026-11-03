import { purchaseOrderReceiptDraftSchema, purchaseOrderReceiptSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseOrderReceipts, purchaseOrders, suppliers } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerPurchaseOrderReceiptsRoutes } from "./purchase-order-receipts-routes.js";
import { insertSentOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertProduct } from "./test-support/purchasing-fixtures.js";

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
  registerPurchaseOrderReceiptsRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

const receiver = () => signedInWith(db, ["receive_purchase_orders"], NOW);

async function sentOrder(userId: string, locationId: string) {
  const sent = await insertSentOrder(db, {
    actorId: userId,
    locationId,
    products: [
      { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
    ],
  });
  return {
    orderId: sent.orderId,
    supplierId: sent.supplierId,
    productId: sent.productIds[0] as string,
  };
}

function delivery(lines: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    purchasedOn: "2026-10-05",
    receiptType: "sin_comprobante",
    receiptNumber: null,
    note: null,
    lines,
    ...overrides,
  };
}

function packagesOf(productId: string, packages: number, costPaidCents = 3_000) {
  return {
    loadedBy: "packages",
    productId,
    packages,
    quantityPerPackage: 12_000,
    costPaidCents,
    expiresOn: null,
  };
}

const REQUESTS = [
  { method: "POST", url: `/purchase-orders/${MISSING_ID}/receipts`, payload: delivery([]) },
  { method: "GET", url: `/purchase-orders/${MISSING_ID}/receipt-draft` },
] as const;

describe("the purchase order receipt routes' access", () => {
  it.each(REQUESTS)("$method $url answers 401 without a session", async (request) => {
    const response = await app.inject({ ...request, headers: { origin: BACKOFFICE_ORIGIN } });

    expect(response.statusCode).toBe(401);
  });

  it.each(REQUESTS)(
    "$method $url answers 403 to whoever may manage orders but not receive them",
    async (request) => {
      const { headers } = await signedInWith(db, ["manage_purchase_orders"], NOW);

      const response = await app.inject({ ...request, headers });

      expect(response.statusCode).toBe(403);
    },
  );

  it("refuses a foreign Origin on a receipt, receiving nothing", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, locationId);

    const response = await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 3)]),
      headers: { ...headers, origin: "https://elsewhere.example" },
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(purchaseOrderReceipts)).toEqual([]);
  });
});

describe("POST /purchase-orders/:id/receipts", () => {
  it("receives the whole order into a purchase and answers it received", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, locationId);

    const response = await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 3)]),
      headers,
    });

    expect(response.statusCode).toBe(201);
    const [receipt] = await db.select().from(purchaseOrderReceipts);
    expect(purchaseOrderReceiptSchema.parse(response.json())).toEqual({
      purchaseId: receipt?.purchaseId,
      state: "RECEIVED",
    });
    expect(receipt).toMatchObject({ purchaseOrderId: orderId, actorId: userId, receivedAt: NOW });
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
    expect(order).toMatchObject({ state: "RECEIVED", receivedAt: NOW });
  });

  it("answers an order received in part as partially received", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, locationId);

    const response = await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 1)]),
      headers,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ state: "PARTIALLY_RECEIVED" });
  });

  it("does not find an order that does not exist or belongs to another branch", async () => {
    const { headers, userId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, await insertLocation(db));

    const missing = await app.inject({
      method: "POST",
      url: `/purchase-orders/${MISSING_ID}/receipts`,
      payload: delivery([packagesOf(productId, 3)]),
      headers,
    });
    const foreign = await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 3)]),
      headers,
    });

    for (const response of [missing, foreign]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "purchase_order_not_found" });
    }
  });

  it("refuses an order that was already received in full", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, locationId);
    const request = {
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 3)]),
      headers,
    } as const;
    await app.inject(request);

    const response = await app.inject(request);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchase_order_not_receivable" });
    expect(await db.select().from(purchaseOrderReceipts)).toHaveLength(1);
  });

  it("refuses a delivery of none of the ordered products", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId } = await sentOrder(userId, locationId);
    const { id: otherProductId } = await insertProduct(db, { name: "Azúcar" });

    const response = await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(otherProductId, 1)]),
      headers,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "nothing_ordered_received" });
  });

  it("answers a refused purchase as any purchase route does", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId, supplierId } = await sentOrder(userId, locationId);
    const send = (payload: Record<string, unknown>) =>
      app.inject({ method: "POST", url: `/purchase-orders/${orderId}/receipts`, payload, headers });

    const future = await send(delivery([packagesOf(productId, 1)], { purchasedOn: "2026-10-06" }));
    const unknownProduct = await send(
      delivery([packagesOf(productId, 1), packagesOf(MISSING_ID, 1)]),
    );
    const unfitQuantity = await send(
      delivery([{ ...packagesOf(productId, 1), quantityPerPackage: 1_500 }]),
    );
    await db.update(suppliers).set({ active: false }).where(eq(suppliers.id, supplierId));
    const inactiveSupplier = await send(delivery([packagesOf(productId, 1)]));

    expect(
      [future, unknownProduct, unfitQuantity, inactiveSupplier].map((r) => r.statusCode),
    ).toEqual([400, 404, 400, 409]);
    expect(unknownProduct.json()).toMatchObject({
      code: "product_not_found",
      details: [{ field: "lines", lineIndex: 1 }],
    });
    expect(inactiveSupplier.json()).toMatchObject({ code: "supplier_inactive" });
    expect(await db.select().from(purchaseOrderReceipts)).toEqual([]);
  });

  it("refuses a body that is not a purchase before reading the order", async () => {
    const { headers } = await receiver();

    const response = await app.inject({
      method: "POST",
      url: `/purchase-orders/${MISSING_ID}/receipts`,
      payload: delivery([]),
      headers,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /purchase-orders/:id/receipt-draft", () => {
  it("answers the lines of the order at the supplier's list cost", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, supplierId, productId } = await sentOrder(userId, locationId);

    const response = await app.inject({
      method: "GET",
      url: `/purchase-orders/${orderId}/receipt-draft`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseOrderReceiptDraftSchema.parse(response.json())).toEqual({
      supplier: { id: supplierId, name: expect.any(String) },
      lines: [
        {
          loadedBy: "packages",
          product: expect.objectContaining({ id: productId, name: "Yerba" }),
          packages: 3,
          quantityPerPackage: 12_000,
          listCostPerPackageCents: 3_000,
        },
      ],
    });
  });

  it("answers only what earlier receipts left outstanding", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, locationId);
    await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 2)]),
      headers,
    });

    const response = await app.inject({
      method: "GET",
      url: `/purchase-orders/${orderId}/receipt-draft`,
      headers,
    });

    expect(response.json()).toMatchObject({ lines: [{ loadedBy: "packages", packages: 1 }] });
  });

  it("does not find an order that does not exist or belongs to another branch", async () => {
    const { headers, userId } = await receiver();
    const { orderId } = await sentOrder(userId, await insertLocation(db));

    const missing = await app.inject({
      method: "GET",
      url: `/purchase-orders/${MISSING_ID}/receipt-draft`,
      headers,
    });
    const foreign = await app.inject({
      method: "GET",
      url: `/purchase-orders/${orderId}/receipt-draft`,
      headers,
    });

    for (const response of [missing, foreign]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "purchase_order_not_found" });
    }
  });

  it("refuses an order that can no longer be received", async () => {
    const { headers, userId, locationId } = await receiver();
    const { orderId, productId } = await sentOrder(userId, locationId);
    await app.inject({
      method: "POST",
      url: `/purchase-orders/${orderId}/receipts`,
      payload: delivery([packagesOf(productId, 3)]),
      headers,
    });

    const response = await app.inject({
      method: "GET",
      url: `/purchase-orders/${orderId}/receipt-draft`,
      headers,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchase_order_not_receivable" });
  });
});
