import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lots } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerInitialInventoryLotsRoutes } from "./initial-inventory-lots-route.js";
import { insertLoadedSupplierPrice } from "./test-support/loaded-supplier-price-fixtures.js";
import {
  insertInitialCountLot,
  insertPurchasedLot,
  insertTechnicalLot,
} from "./test-support/lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-10-16T15:00:00.000Z");
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
  registerInitialInventoryLotsRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function listRequest(headers: Record<string, string>, query = "") {
  return app.inject({ method: "GET", url: `/initial-inventory-lots${query}`, headers });
}

function setCostRequest(
  headers: Record<string, string>,
  lotId: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "PUT",
    url: `/initial-inventory-lots/${lotId}/reference-cost`,
    headers,
    payload,
  });
}

describe("GET /initial-inventory-lots", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await listRequest({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a user without record_initial_inventory, even one who views balances", async () => {
    const { headers } = await signedInWith(
      db,
      ["view_stock_balances", "perform_stock_counts", "adjust_stock"],
      NOW,
    );

    const response = await listRequest(headers);

    expect(response.statusCode).toBe(403);
  });

  it("reaches the query validator, answering a validation failure on the named field", async () => {
    const { headers } = await signedInWith(db, ["record_initial_inventory"], NOW);

    const response = await listRequest(headers, "?cost=all");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "cost" }],
    });
  });

  it("lists the lots of the initial count of the user's branch with their cost and value", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
      brandName: "Vitora",
      netContent: { quantity: 250, unit: "G" },
    });
    const known = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: userId,
      counted: 2_500,
      expiresOn: "2027-02-01",
      unitCostCents: 3_500,
    });
    const unknown = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: userId,
      counted: 1_000,
    });
    await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: userId,
      withdrawn: true,
      remaining: 0,
    });
    await insertInitialCountLot(db, { productId, locationId: otherLocationId, actorId: userId });
    await insertPurchasedLot(db, { productId, locationId, actorId: userId });

    const response = await listRequest(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lots: [
        {
          lotId: known.lotId,
          productId,
          productName: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: "2027-02-01",
          counted: 2_500,
          withdrawn: false,
          remaining: 2_500,
          costIncomplete: false,
          unitCostCents: 3_500,
          valueCents: 8_750,
          supplierPrices: [],
        },
        {
          lotId: unknown.lotId,
          productId,
          productName: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: null,
          counted: 1_000,
          withdrawn: false,
          remaining: 1_000,
          costIncomplete: true,
          unitCostCents: null,
          valueCents: null,
          supplierPrices: [],
        },
      ],
    });
  });

  it("offers with each lot the prices loaded for its product, cheapest first, marking the one its cost equals", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });
    const cheap = await insertLoadedSupplierPrice(db, {
      productId,
      actorId: userId,
      supplierName: "Alfa",
      priceCents: 1_000,
      quantity: 3_000,
      listDate: "2026-04-01",
    });
    const dear = await insertLoadedSupplierPrice(db, {
      productId,
      actorId: userId,
      supplierName: "Beta",
      priceCents: 900,
      listDate: "2026-03-01",
    });
    await setCostRequest(headers, lotId, { supplierItemId: cheap.supplierItemId });

    const response = await listRequest(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json().lots[0]).toMatchObject({
      costIncomplete: false,
      unitCostCents: 333,
      supplierPrices: [
        {
          supplierItemId: cheap.supplierItemId,
          supplierName: "Alfa",
          quantity: 3_000,
          saleUnit: "UNIT",
          listDate: "2026-04-01",
          unitCostCents: 333,
          cheapest: true,
          current: true,
        },
        {
          supplierItemId: dear.supplierItemId,
          supplierName: "Beta",
          listDate: "2026-03-01",
          unitCostCents: 900,
          cheapest: false,
          current: false,
        },
      ],
    });
  });

  it("lists the lot of a withdrawn line that still holds stock, marked and with what it holds", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const holding = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: userId,
      counted: 2_500,
      withdrawn: true,
      remaining: 1_500,
    });

    const response = await listRequest(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json().lots).toEqual([
      expect.objectContaining({ lotId: holding.lotId, withdrawn: true, remaining: 1_500 }),
    ]);
  });

  it("narrows the list by cost and by the product's name", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const yerba = await insertProduct(db, { name: "Yerba mate 1 kg" });
    const miel = await insertProduct(db, { name: "Miel pura" });
    const yerbaLot = await insertInitialCountLot(db, { ...yerba, locationId, actorId: userId });
    await insertInitialCountLot(db, {
      ...miel,
      locationId,
      actorId: userId,
      unitCostCents: 100,
    });
    const lotIdsOf = async (query: string) =>
      (await listRequest(headers, query))
        .json<{ lots: { lotId: string }[] }>()
        .lots.map((lot) => lot.lotId);

    expect(await lotIdsOf("?cost=incomplete")).toEqual([yerbaLot.lotId]);
    expect(await lotIdsOf("?cost=known")).toHaveLength(1);
    expect(await lotIdsOf("?product=YERBA")).toEqual([yerbaLot.lotId]);
    expect(await lotIdsOf("?cost=known&product=yerba")).toEqual([]);
  });
});

describe("PUT /initial-inventory-lots/:lotId/reference-cost", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await setCostRequest({ origin: BACKOFFICE_ORIGIN }, MISSING_ID, {});

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["record_initial_inventory"], NOW);

    const response = await setCostRequest(
      { ...headers, origin: "https://attacker.example" },
      MISSING_ID,
      { unitCostCents: 100 },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without record_initial_inventory before reading the lot", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["perform_stock_counts"], NOW);
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });

    const response = await setCostRequest(headers, lotId, { unitCostCents: 100 });

    expect(response.statusCode).toBe(403);
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot?.costIncomplete).toBe(true);
  });

  it("reaches the body validator, answering a validation failure on the named field", async () => {
    const { headers } = await signedInWith(db, ["record_initial_inventory"], NOW);

    const response = await setCostRequest(headers, MISSING_ID, { unitCostCents: 0 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "unitCostCents" }],
    });
  });

  it("refuses a lot id that is no id", async () => {
    const { headers } = await signedInWith(db, ["record_initial_inventory"], NOW);

    const response = await setCostRequest(headers, "not-an-id", { unitCostCents: 100 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "lotId" }] });
  });

  it("sets the reference cost of a lot of the initial count, answering no content", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });

    const response = await setCostRequest(headers, lotId, { unitCostCents: 3_500 });

    expect(response.statusCode).toBe(204);
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot).toMatchObject({
      costTotalCents: 3_500,
      costQuantity: 1_000,
      costIncomplete: false,
    });
  });

  it("answers not found for a lot that does not exist or belongs to another branch", async () => {
    const { headers, userId } = await signedInWith(db, ["record_initial_inventory"], NOW);
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, {
      productId,
      locationId: otherLocationId,
      actorId: userId,
    });

    const missing = await setCostRequest(headers, MISSING_ID, { unitCostCents: 100 });
    const foreign = await setCostRequest(headers, lotId, { unitCostCents: 100 });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "not_found" });
    expect(foreign.statusCode).toBe(404);
  });

  it("sets the reference cost of a withdrawn line's lot that still holds stock", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: userId,
      withdrawn: true,
      remaining: 1,
    });

    const response = await setCostRequest(headers, lotId, { unitCostCents: 3_500 });

    expect(response.statusCode).toBe(204);
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot).toMatchObject({
      costTotalCents: 3_500,
      costQuantity: 1_000,
      costIncomplete: false,
    });
  });

  it("answers not found for a lot withdrawn from the initial count that holds no stock", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: userId,
      withdrawn: true,
      remaining: 0,
    });

    const response = await setCostRequest(headers, lotId, { unitCostCents: 100 });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "lot_withdrawn" });
  });

  it("refuses to set the cost of a lot that is not of the initial count", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const purchased = await insertPurchasedLot(db, { productId, locationId, actorId: userId });
    const technical = await insertTechnicalLot(db, { productId, locationId, remaining: 0 });

    const purchase = await setCostRequest(headers, purchased, { unitCostCents: 100 });
    const technicalResponse = await setCostRequest(headers, technical, { unitCostCents: 100 });

    expect(purchase.statusCode).toBe(409);
    expect(purchase.json()).toMatchObject({ code: "not_an_initial_count_lot" });
    expect(technicalResponse.statusCode).toBe(409);
  });
});

describe("PUT /initial-inventory-lots/:lotId/reference-cost with supplier prices", () => {
  it("sets the lot's cost to the loaded price of the supplier item chosen, answering no content", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });
    await insertLoadedSupplierPrice(db, { productId, actorId: userId, priceCents: 900 });
    const { supplierItemId } = await insertLoadedSupplierPrice(db, {
      productId,
      actorId: userId,
      priceCents: 1_000,
      quantity: 3_000,
    });

    const response = await setCostRequest(headers, lotId, { supplierItemId });

    expect(response.statusCode).toBe(204);
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot).toMatchObject({ costTotalCents: 1, costQuantity: 3, costIncomplete: false });
  });

  it("reaches the body validator for a supplier item that is no id, naming its field", async () => {
    const { headers } = await signedInWith(db, ["record_initial_inventory"], NOW);

    const response = await setCostRequest(headers, MISSING_ID, { supplierItemId: "not-an-id" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "supplierItemId" }],
    });
  });

  it("refuses a typed cost once the product has a loaded price, answering a conflict", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });
    await insertLoadedSupplierPrice(db, { productId, actorId: userId, priceCents: 900 });

    const response = await setCostRequest(headers, lotId, { unitCostCents: 100 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "cost_chosen_from_supplier_prices" });
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    expect(lot).toMatchObject({ costIncomplete: true });
  });

  it("refuses a supplier item with no loaded price for the lot's product, answering a conflict", async () => {
    const { headers, locationId, userId } = await signedInWith(
      db,
      ["record_initial_inventory"],
      NOW,
    );
    const { productId } = await insertProduct(db);
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });

    const response = await setCostRequest(headers, lotId, { supplierItemId: MISSING_ID });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "supplier_price_not_found" });
  });
});
