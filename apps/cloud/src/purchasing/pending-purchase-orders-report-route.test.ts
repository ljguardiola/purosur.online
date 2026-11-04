import { pendingPurchaseOrdersSchema } from "@purosur/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerPendingPurchaseOrdersReportRoute } from "./pending-purchase-orders-report-route.js";
import { registerPurchaseOrderReceiptsRoutes } from "./purchase-order-receipts-routes.js";
import { insertOrderRow } from "./test-support/pending-purchase-orders-fixtures.js";
import { insertSentOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertSupplier } from "./test-support/purchases-report-fixtures.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const MARCH = "?from=2026-03-01&to=2026-03-31";

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
  const options = {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  };
  registerPendingPurchaseOrdersReportRoute(app, options);
  registerPurchaseOrderReceiptsRoutes(app, options);
});

afterEach(async () => {
  await app.close();
});

function pendingOrders(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/pending-purchase-orders${query}`, headers });
}

function receive(
  headers: Record<string, string>,
  orderId: string,
  productId: string,
  packages: number,
) {
  return app.inject({
    method: "POST",
    url: `/purchase-orders/${orderId}/receipts`,
    headers,
    payload: {
      purchasedOn: "2026-10-05",
      receiptType: "sin_comprobante",
      receiptNumber: null,
      note: null,
      lines: [
        {
          loadedBy: "packages",
          productId,
          packages,
          quantityPerPackage: 12_000,
          costPaidCents: 3_000,
          expiresOn: null,
        },
      ],
    },
  });
}

async function sentOrder(userId: string, locationId: string) {
  const sent = await insertSentOrder(db, {
    actorId: userId,
    locationId,
    products: [
      { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
    ],
  });
  return { orderId: sent.orderId, productId: sent.productIds[0] as string };
}

describe("GET /reports/pending-purchase-orders access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await pendingOrders({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await pendingOrders({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["receive_purchase_orders"], NOW);

    const response = await pendingOrders(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await pendingOrders(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/pending-purchase-orders", () => {
  it("answers 400 to a range the contract refuses", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await pendingOrders(headers, "?from=2026-10-09&to=2026-10-01");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the last 30 days up to today when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await pendingOrders(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-09-06", to: "2026-10-05" },
      orders: [],
      totals: { orders: 0, suppliers: 0, expected_total_cents: 0, has_unpriced_line: false },
    });
  });

  it("lists the pending orders of the branch of the session with their supplier and expected total", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    const supplierId = await insertSupplier(db, { actorId: userId, name: "Distribuidora Sur" });
    const orderId = await insertOrderRow(db, {
      supplierId,
      locationId,
      actorId: userId,
      productId,
      state: "SENT",
      sentAt: new Date("2026-10-02T13:00:00.000Z"),
      lines: [{ packages: 2, expectedPackagePriceCents: 1_500 }],
    });
    await insertOrderRow(db, {
      supplierId,
      locationId: await insertLocation(db),
      actorId: userId,
      productId,
      state: "SENT",
    });

    const response = await pendingOrders(headers, "?from=2026-10-01&to=2026-10-05");

    expect(pendingPurchaseOrdersSchema.parse(response.json())).toEqual({
      range: { from: "2026-10-01", to: "2026-10-05" },
      orders: [
        {
          id: orderId,
          supplier: { id: supplierId, name: "Distribuidora Sur" },
          state: "SENT",
          sent_at: "2026-10-02T13:00:00.000Z",
          line_count: 1,
          expected_total_cents: 3_000,
          has_unpriced_line: false,
        },
      ],
      totals: { orders: 1, suppliers: 1, expected_total_cents: 3_000, has_unpriced_line: false },
    });
  });

  it("lists neither a draft, a received nor a cancelled order", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    const supplierId = await insertSupplier(db, { actorId: userId, name: "Distribuidora Sur" });
    for (const state of ["DRAFT", "RECEIVED", "CANCELLED"] as const) {
      await insertOrderRow(db, { supplierId, locationId, actorId: userId, productId, state });
    }

    const response = await pendingOrders(headers, "?from=2026-10-01&to=2026-10-05");

    expect(response.json().orders).toEqual([]);
  });

  it("lists an order partially received right after it is received in part, and no longer once its last quantity arrives", async () => {
    const { headers, userId, locationId } = await signedInWith(
      db,
      ["view_reports", "receive_purchase_orders"],
      NOW,
    );
    const { orderId, productId } = await sentOrder(userId, locationId);
    const listed = async () =>
      (await pendingOrders(headers, MARCH))
        .json()
        .orders.map((order: { id: string; state: string }) => [order.id, order.state]);
    const beforeReceiving = await listed();

    await receive(headers, orderId, productId, 1);
    const afterPart = await listed();
    await receive(headers, orderId, productId, 2);
    const afterAll = await listed();

    expect(beforeReceiving).toEqual([[orderId, "SENT"]]);
    expect(afterPart).toEqual([[orderId, "PARTIALLY_RECEIVED"]]);
    expect(afterAll).toEqual([]);
  });
});
