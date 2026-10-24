import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerSupplierPriceComparisonRoutes } from "./supplier-price-comparison-routes.js";
import { insertActor, insertPackaging, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");

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
  registerSupplierPriceComparisonRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

describe("GET /supplier-price-comparison", () => {
  it("answers 401 when no session cookie was sent", async () => {
    const response = await app.inject({ method: "GET", url: "/supplier-price-comparison" });

    expect(response.statusCode).toBe(401);
  });

  it("answers 403 to a user who may load supplier price lists but not compare prices", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await app.inject({
      method: "GET",
      url: "/supplier-price-comparison",
      headers,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the active products with their offers, cheapest first, with exact prices per sale unit", async () => {
    const { headers } = await signedInWith(db, ["compare_prices_and_suggest_orders"], NOW);
    const actorId = await insertActor(db);
    const locationId = await seededLocationId(db);
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const offers = [
      { name: "Alfa", priceCents: 12_000, quantityPerPackage: 10_000 },
      { name: "Beta", priceCents: 5_000, quantityPerPackage: 3_000 },
    ];
    for (const offer of offers) {
      const supplierId = await insertSupplier(db, { actorId, name: offer.name });
      const packagingId = await insertPackaging(db, {
        productId,
        actorId,
        quantityPerPackage: offer.quantityPerPackage,
      });
      const itemId = await insertSupplierItem(db, { supplierId, productId, packagingId });
      const listId = await insertPriceList(db, {
        supplierId,
        locationId,
        actorId,
        state: "REVIEWED",
      });
      await insertSupplierItemPrice(db, {
        itemId,
        listId,
        priceCents: offer.priceCents,
        pricesIncludeVat: true,
        listDate: "2026-03-01",
      });
    }

    const response = await app.inject({
      method: "GET",
      url: "/supplier-price-comparison",
      headers,
    });

    expect(response.statusCode).toBe(200);
    const [product] = response.json().products;
    expect(product).toMatchObject({ id: productId, name: "Yerba 1 kg", saleUnit: "UNIT" });
    expect(
      product.offers.map(
        (offer: { supplier: { name: string }; pricePerSaleUnit: unknown; cheapest: boolean }) => [
          offer.supplier.name,
          offer.pricePerSaleUnit,
          offer.cheapest,
        ],
      ),
    ).toEqual([
      ["Alfa", { numerator: "1200", denominator: "1" }, true],
      ["Beta", { numerator: "5000", denominator: "3" }, false],
    ]);
  });

  it("answers a product nobody offers with no offers", async () => {
    const { headers } = await signedInWith(db, ["compare_prices_and_suggest_orders"], NOW);
    await insertProduct(db, { name: "Harina" });

    const response = await app.inject({
      method: "GET",
      url: "/supplier-price-comparison",
      headers,
    });

    expect(response.json().products).toMatchObject([{ name: "Harina", offers: [] }]);
  });
});
