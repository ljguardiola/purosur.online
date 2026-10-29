import { purchasesBySupplierSchema } from "@purosur/contracts";
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
import { registerPurchasesBySupplierReportRoute } from "./purchases-by-supplier-report-route.js";
import { registerPurchasesRoutes } from "./purchases-routes.js";
import { insertPurchaseOfLines, insertSupplier } from "./test-support/purchases-report-fixtures.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");

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
  registerPurchasesBySupplierReportRoute(app, options);
  registerPurchasesRoutes(app, options);
});

afterEach(async () => {
  await app.close();
});

function purchasesBySupplier(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/reports/purchases-by-supplier${query}`, headers });
}

describe("GET /reports/purchases-by-supplier access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await purchasesBySupplier({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await purchasesBySupplier({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await purchasesBySupplier(headers);

    expect(response.statusCode).toBe(403);
  });

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await purchasesBySupplier(headers);

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /reports/purchases-by-supplier", () => {
  it("answers 400 to a range the contract refuses", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await purchasesBySupplier(headers, "?from=2026-10-09&to=2026-10-01");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("reports the current Argentina day when no range is asked", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await purchasesBySupplier(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-05", to: "2026-10-05" },
      suppliers: [],
      totals: { suppliers: 0, purchases: 0, amount: 0 },
    });
  });

  it("reports the purchases of the branch of the session by supplier and month", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    const supplierId = await insertSupplier(db, { actorId: userId, name: "Distribuidora Sur" });
    const line = { costPaidCents: 1_000, quantity: 2_000, quantityPerPackage: 1_000 };
    await insertPurchaseOfLines(db, {
      supplierId,
      locationId,
      actorId: userId,
      productId,
      purchasedOn: "2026-10-02",
      lines: [line, line],
    });
    await insertPurchaseOfLines(db, {
      supplierId,
      locationId: await insertLocation(db),
      actorId: userId,
      productId,
      purchasedOn: "2026-10-02",
      lines: [line],
    });

    const response = await purchasesBySupplier(headers, "?from=2026-10-01&to=2026-10-05");

    const body = purchasesBySupplierSchema.parse(response.json());
    expect(body).toEqual({
      range: { from: "2026-10-01", to: "2026-10-05" },
      suppliers: [
        {
          supplier_id: supplierId,
          name: "Distribuidora Sur",
          months: [{ month: "2026-10", purchases: 1, amount: 4_000 }],
          purchases: 1,
          amount: 4_000,
        },
      ],
      totals: { suppliers: 1, purchases: 1, amount: 4_000 },
    });
  });

  it("includes a purchase from the moment it is registered", async () => {
    const { headers, userId } = await signedInWith(db, ["view_reports", "record_purchases"], NOW);
    const { productId } = await insertProduct(db);
    const supplierId = await insertSupplier(db, { actorId: userId, name: "Distribuidora Sur" });
    const before = await purchasesBySupplier(headers, "?from=2026-10-04&to=2026-10-04");

    const registered = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: {
        supplierId,
        purchasedOn: "2026-10-04",
        receiptType: "factura_b",
        receiptNumber: "0001-00000042",
        note: null,
        lines: [
          {
            loadedBy: "quantity",
            productId,
            quantity: 3_000,
            costPaidCents: 900,
            lotNumber: null,
            expiresOn: null,
          },
        ],
      },
    });
    const after = await purchasesBySupplier(headers, "?from=2026-10-04&to=2026-10-04");

    expect(registered.statusCode).toBe(201);
    expect(before.json().totals).toEqual({ suppliers: 0, purchases: 0, amount: 0 });
    expect(after.json().totals).toEqual({ suppliers: 1, purchases: 1, amount: 2_700 });
  });
});
