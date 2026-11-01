import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertPurchasedLot } from "../stock/test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerOrderSuggestionRoutes } from "./order-suggestion-routes.js";
import {
  completeSale,
  insertRegisterDeviceIn,
  setCoverageDays,
  setStock,
} from "./test-support/order-suggestion-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const SOLD_AT = new Date("2026-09-10T15:00:00.000Z");

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
  registerOrderSuggestionRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

async function offerFrom(
  supplierName: string,
  productId: string,
  offer: { priceCents: number; quantity: number },
) {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const supplierId = await insertSupplier(db, { actorId, name: supplierName });
  const itemId = await insertSupplierItem(db, {
    supplierId,
    productId,
    quantity: offer.quantity,
    saleUnit: "UNIT",
  });
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
    listDate: "2026-09-01",
  });
}

const get = (headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/order-suggestion", headers });

describe("GET /order-suggestion", () => {
  it("answers 401 when no session cookie was sent", async () => {
    expect((await get()).statusCode).toBe(401);
  });

  it("answers 403 to a user who may load supplier price lists but not suggest orders", async () => {
    const { headers } = await signedInWith(db, ["manage_supplier_price_lists"], NOW);

    const response = await get(headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers the packages of the cheapest supplier that cover the coverage days", async () => {
    const { headers, locationId } = await signedInWith(
      db,
      ["compare_prices_and_suggest_orders"],
      NOW,
    );
    const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    await offerFrom("Alfa", productId, { priceCents: 12_000, quantity: 12_000 });
    await offerFrom("Beta", productId, { priceCents: 5_000, quantity: 3_000 });
    await completeSale(db, { deviceId, productId, quantity: 120, completedAt: SOLD_AT });
    await setStock(db, { productId, locationId, quantity: 12_000 });

    const response = await get(headers);

    expect(response.statusCode).toBe(200);
    const [line] = response.json().lines;
    expect(line).toMatchObject({
      id: productId,
      name: "Yerba 1 kg",
      effectiveDays: 15,
      cappedByExpiry: false,
      soldQuantity: 120_000,
      stock: 12_000,
      neededQuantity: 48_000,
    });
    expect(
      line.offers.map(
        (offer: { supplier: { name: string }; cheapest: boolean; packages: number }) => [
          offer.supplier.name,
          offer.cheapest,
          offer.packages,
        ],
      ),
    ).toEqual([
      ["Alfa", true, 4],
      ["Beta", false, 16],
    ]);
    expect(line.offers[0]).toMatchObject({
      packageQuantity: 12_000,
      quantity: 48_000,
      pricePerSaleUnit: { numerator: "1000", denominator: "1" },
    });
  });

  it("caps the days and the packages by the shelf life of the newest lot", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["compare_prices_and_suggest_orders"],
      NOW,
    );
    const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    await offerFrom("Alfa", productId, { priceCents: 12_000, quantity: 12_000 });
    await completeSale(db, { deviceId, productId, quantity: 120, completedAt: SOLD_AT });
    await setStock(db, { productId, locationId, quantity: 20_000 });
    await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId: userId,
      expiresOn: "2026-09-11",
      createdAt: new Date("2026-09-01T15:00:00.000Z"),
    });

    const response = await get(headers);

    expect(response.json().lines).toMatchObject([
      {
        id: productId,
        effectiveDays: 10,
        cappedByExpiry: true,
        neededQuantity: 20_000,
        offers: [{ packages: 1, quantity: 12_000 }],
      },
    ]);
  });

  it("answers a product nobody offers with the units it needs and no offers", async () => {
    const { headers, locationId } = await signedInWith(
      db,
      ["compare_prices_and_suggest_orders"],
      NOW,
    );
    const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
    const { id: productId } = await insertProduct(db, { name: "Harina" });
    await setCoverageDays(db, productId, 30);
    await completeSale(db, { deviceId, productId, quantity: 31, completedAt: SOLD_AT });
    await setStock(db, { productId, locationId, quantity: 0 });

    const response = await get(headers);

    expect(response.json().lines).toMatchObject([
      { id: productId, neededQuantity: 31_000, offers: [], unpricedOffers: [] },
    ]);
  });

  it("answers the suppliers a product without a priced offer may be ordered from", async () => {
    const { headers } = await signedInWith(db, ["compare_prices_and_suggest_orders"], NOW);
    const actorId = await insertActor(db);
    const supplierId = await insertSupplier(db, { actorId, name: "Granos del Valle" });

    expect((await get(headers)).json().suppliers).toEqual([
      { id: supplierId, name: "Granos del Valle" },
    ]);
  });

  it("answers nothing for a product whose stock covers its coverage days", async () => {
    const { headers, locationId } = await signedInWith(
      db,
      ["compare_prices_and_suggest_orders"],
      NOW,
    );
    const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
    const { id: productId } = await insertProduct(db, { name: "Harina" });
    await completeSale(db, { deviceId, productId, quantity: 30, completedAt: SOLD_AT });
    await setStock(db, { productId, locationId, quantity: 15_000 });

    expect((await get(headers)).json().lines).toEqual([]);
  });

  it("counts only the sales and the stock of the session's branch", async () => {
    const { headers, locationId } = await signedInWith(
      db,
      ["compare_prices_and_suggest_orders"],
      NOW,
    );
    const otherBranch = await insertLocation(db);
    const ownDevice = await insertRegisterDeviceIn(db, locationId, NOW);
    const otherDevice = await insertRegisterDeviceIn(db, otherBranch, NOW);
    const { id: productId } = await insertProduct(db, { name: "Harina" });
    await completeSale(db, { deviceId: ownDevice, productId, quantity: 30, completedAt: SOLD_AT });
    await completeSale(db, {
      deviceId: otherDevice,
      productId,
      quantity: 900,
      completedAt: SOLD_AT,
    });
    await setStock(db, { productId, locationId, quantity: 5_000 });
    await setStock(db, { productId, locationId: otherBranch, quantity: 500_000 });

    const response = await get(headers);

    expect(response.json().lines).toMatchObject([
      { id: productId, soldQuantity: 30_000, stock: 5_000, neededQuantity: 10_000 },
    ]);
  });
});
