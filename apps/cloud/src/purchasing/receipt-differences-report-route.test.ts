import { receiptDifferencesSchema } from "@purosur/contracts";
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
import { registerPurchaseOrderReceiptsRoutes } from "./purchase-order-receipts-routes.js";
import { registerReceiptDifferencesReportRoute } from "./receipt-differences-report-route.js";
import { insertSentOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertSupplier } from "./test-support/purchases-report-fixtures.js";
import { insertReceivedOrder } from "./test-support/receipt-differences-fixtures.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const OCTOBER = "?from=2026-10-01&to=2026-10-31";

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
  registerReceiptDifferencesReportRoute(app, options);
  registerPurchaseOrderReceiptsRoutes(app, options);
});

afterEach(async () => {
  await app.close();
});

function differences(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/receipt-differences${query}`, headers });
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

describe("GET /reports/receipt-differences access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await differences({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await differences({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["receive_purchase_orders"], NOW);

    const response = await differences(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await differences(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/receipt-differences", () => {
  it("answers 400 to a range the contract refuses", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await differences(headers, "?from=2026-10-09&to=2026-10-01");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await differences(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-05", to: "2026-10-05" },
      suppliers: [],
      totals: { suppliers: 0, short_lines: 0, price_difference_lines: 0, price_difference_cents: 0 },
    });
  });

  it("reports the differences of the receipts of the session's branch by supplier and month, leaving out lines that match", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db, { name: "Yerba mate" });
    const supplierId = await insertSupplier(db, { actorId: userId, name: "Distribuidora Sur" });
    const context = { supplierId, actorId: userId, productId };
    const receivedAt = new Date("2026-10-02T13:00:00.000Z");
    const { orderId, receiptId } = await insertReceivedOrder(db, {
      ...context,
      locationId,
      receivedAt,
      lines: [{ receivedQuantity: 6_000, missingQuantity: 4_000, priceDifferenceCents: -120 }],
    });
    await insertReceivedOrder(db, {
      ...context,
      locationId,
      receivedAt,
      lines: [{ receivedQuantity: 10_000, missingQuantity: 0, priceDifferenceCents: null }],
    });
    await insertReceivedOrder(db, { ...context, locationId: await insertLocation(db), receivedAt });

    const response = await differences(headers, OCTOBER);

    expect(receiptDifferencesSchema.parse(response.json())).toEqual({
      range: { from: "2026-10-01", to: "2026-10-31" },
      suppliers: [
        {
          supplier_id: supplierId,
          name: "Distribuidora Sur",
          short_lines: 1,
          price_difference_lines: 1,
          price_difference_cents: -120,
          months: [
            {
              month: "2026-10",
              short_lines: 1,
              price_difference_lines: 1,
              price_difference_cents: -120,
              lines: [
                {
                  receipt_id: receiptId,
                  order_id: orderId,
                  received_on: "2026-10-02",
                  product: {
                    id: productId,
                    name: "Yerba mate",
                    brandName: null,
                    netContent: null,
                    saleUnit: "UNIT",
                  },
                  received_quantity: 6_000,
                  missing_quantity: 4_000,
                  price_difference_cents: -120,
                },
              ],
            },
          ],
        },
      ],
      totals: { suppliers: 1, short_lines: 1, price_difference_lines: 1, price_difference_cents: -120 },
    });
  });

  it("includes a receipt with a shortfall from the moment it is recorded, and shows the shortfall again on each later receipt that leaves it outstanding", async () => {
    const { headers, userId, locationId } = await signedInWith(
      db,
      ["view_reports", "receive_purchase_orders"],
      NOW,
    );
    const sent = await insertSentOrder(db, {
      actorId: userId,
      locationId,
      products: [
        { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
      ],
    });
    const productId = sent.productIds[0] as string;
    const shortLines = async () =>
      (await differences(headers, OCTOBER)).json().suppliers[0]?.short_lines ?? 0;
    const beforeReceiving = await shortLines();

    await receive(headers, sent.orderId, productId, 1);
    const afterFirst = await shortLines();
    await receive(headers, sent.orderId, productId, 1);
    const afterSecond = await shortLines();
    await receive(headers, sent.orderId, productId, 1);
    const afterLast = await shortLines();

    expect([beforeReceiving, afterFirst, afterSecond, afterLast]).toEqual([0, 1, 2, 2]);
    const lines = (await differences(headers, OCTOBER)).json().suppliers[0].months[0].lines;
    expect(lines.map((line: { missing_quantity: number }) => line.missing_quantity)).toEqual([
      24_000, 12_000,
    ]);
  });
});
