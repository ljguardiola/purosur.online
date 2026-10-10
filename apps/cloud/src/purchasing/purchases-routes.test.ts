import { purchaseListSchema, purchaseSummarySchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  lots,
  productPackagings,
  purchaseLines,
  purchases,
  stockBalances,
  stockMovements,
  suppliers,
} from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerPurchasesRoutes } from "./purchases-routes.js";

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
  registerPurchasesRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function buyer() {
  return signedInWith(db, ["record_purchases"], NOW);
}

async function storedSupplier(actorId: string, fields: { active?: boolean } = {}) {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: "Distribuidora Sur", actorId, ...fields })
    .returning({ id: suppliers.id });
  return supplier?.id as string;
}

async function storedPackaging(
  productId: string,
  actorId: string,
  fields: { active?: boolean } = {},
) {
  const [packaging] = await db
    .insert(productPackagings)
    .values({
      productId,
      name: "Caja x 12",
      quantityPerPackage: 12_000,
      saleUnit: "UNIT",
      actorId,
      ...fields,
    })
    .returning({ id: productPackagings.id });
  return packaging?.id as string;
}

function quantityLine(productId: string, quantity = 3_000) {
  return {
    loadedBy: "quantity",
    productId,
    quantity,
    costPaidCents: 900,
    lotNumber: null,
    expiresOn: null,
  };
}

function bodyWith(supplierId: string, lines: unknown[], overrides: object = {}) {
  return {
    supplierId,
    purchasedOn: "2026-10-04",
    receiptType: "factura_b",
    receiptNumber: "0001-00000042",
    note: null,
    lines,
    ...overrides,
  };
}

async function nothingWasStored() {
  expect(await db.select().from(purchases)).toEqual([]);
  expect(await db.select().from(purchaseLines)).toEqual([]);
  expect(await db.select().from(lots)).toEqual([]);
  expect(await db.select().from(stockMovements)).toEqual([]);
}

describe("POST /purchases", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the purchases permission, storing nothing", async () => {
    const { headers, userId } = await signedInWith(db, ["sell_and_charge"], NOW);
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId)]),
    });

    expect(response.statusCode).toBe(403);
    await nothingWasStored();
  });

  it("rejects an Origin that is not the backoffice's own, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers: { ...headers, origin: "https://attacker.example" },
      payload: bodyWith(supplierId, [quantityLine(productId)]),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    await nothingWasStored();
  });

  it("rejects a body the contract refuses with 400, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, []),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "lines" }],
    });
    await nothingWasStored();
  });

  it("registers the purchase at the session's branch and answers it with names and unit costs", async () => {
    const { headers, userId, locationId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db, { name: "Yerba" });
    const packagingId = await storedPackaging(productId, userId);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(
        supplierId,
        [
          {
            loadedBy: "packaging",
            productId,
            packagingId,
            packages: 2,
            costPaidCents: 24_000,
            lotNumber: "L-77",
            expiresOn: "2027-03-01",
          },
        ],
        { note: "Entrega de la mañana" },
      ),
    });

    expect(response.statusCode).toBe(201);
    const summary = purchaseSummarySchema.parse(response.json());
    expect(summary).toEqual({
      id: expect.any(String),
      purchasedOn: "2026-10-04",
      supplier: { id: supplierId, name: "Distribuidora Sur" },
      receiptType: "factura_b",
      receiptNumber: "0001-00000042",
      note: "Entrega de la mañana",
      recordedAt: NOW.toISOString(),
      lines: [
        {
          id: expect.any(String),
          product: { id: productId, name: "Yerba", saleUnit: "UNIT" },
          packaging: { id: packagingId, name: "Caja x 12" },
          packages: 2,
          quantity: 24_000,
          costPaidCents: 24_000,
          quantityPerPackage: 12_000,
          unitCostCents: 2_000,
          lotNumber: "L-77",
          expiresOn: "2027-03-01",
        },
      ],
    });
    const [stored] = await db.select().from(purchases).where(eq(purchases.id, summary.id));
    expect(stored).toMatchObject({ locationId, actorId: userId });
    const [balance] = await db.select().from(stockBalances);
    expect(balance).toMatchObject({ productId, locationId, quantity: 24_000 });
  });

  it("registers a purchase at the branch of the session, whatever branch the body names", async () => {
    const { headers, userId, locationId } = await buyer();
    const otherLocationId = await insertLocation(db);
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId)], { locationId: otherLocationId }),
    });

    expect(response.statusCode).toBe(201);
    const [stored] = await db.select().from(purchases);
    expect(stored?.locationId).toBe(locationId);
  });

  it("answers 400 when the purchase date is in the future, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId)], { purchasedOn: "2026-10-06" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "purchasedOn" }],
    });
    await nothingWasStored();
  });

  it("answers 404 for a supplier that does not exist, storing nothing", async () => {
    const { headers } = await buyer();
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(MISSING_ID, [quantityLine(productId)]),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "supplier_not_found" });
    await nothingWasStored();
  });

  it("answers 409 for a deactivated supplier, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId, { active: false });
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId)]),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "supplier_inactive" });
    await nothingWasStored();
  });

  it("answers 404 with the line of a product that does not exist, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId), quantityLine(MISSING_ID)]),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "product_not_found",
      details: [{ field: "lines", lineIndex: 1 }],
    });
    await nothingWasStored();
  });

  it("answers 409 with the line of a deactivated product, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db, { active: false });

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId)]),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "product_inactive",
      details: [{ field: "lines", lineIndex: 0 }],
    });
    await nothingWasStored();
  });

  it("answers 404 with the line of a packaging that does not exist, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [
        { ...quantityLine(productId), loadedBy: "packaging", packagingId: MISSING_ID, packages: 1 },
      ]),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "packaging_not_found",
      details: [{ field: "lines", lineIndex: 0 }],
    });
    await nothingWasStored();
  });

  it("answers 409 with the line of a deactivated packaging, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);
    const packagingId = await storedPackaging(productId, userId, { active: false });

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [
        { ...quantityLine(productId), loadedBy: "packaging", packagingId, packages: 1 },
      ]),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "packaging_inactive",
      details: [{ field: "lines", lineIndex: 0 }],
    });
    await nothingWasStored();
  });

  it("answers 409 with the line of a packaging stated in a sale unit its product no longer has, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db, { saleUnit: "KG" });
    const packagingId = await storedPackaging(productId, userId);

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [
        { ...quantityLine(productId), loadedBy: "packaging", packagingId, packages: 1 },
      ]),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "packaging_sale_unit_changed",
      details: [{ field: "lines", lineIndex: 0 }],
    });
    await nothingWasStored();
  });

  it("answers 400 with the line whose quantity a product sold by the unit cannot have, storing nothing", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db, { saleUnit: "UNIT" });

    const response = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId, 1_500)]),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "lines", lineIndex: 0 }],
    });
    await nothingWasStored();
  });
});

describe("GET /purchases", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/purchases",
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the purchases permission", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({ method: "GET", url: "/purchases", headers });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists a registered purchase, most recent first, with each line's unit cost", async () => {
    const { headers, userId } = await buyer();
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db, { name: "Yerba" });
    await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId)], { purchasedOn: "2026-10-01" }),
    });
    await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: bodyWith(supplierId, [quantityLine(productId, 1_000)], {
        purchasedOn: "2026-10-03",
        receiptType: "sin_comprobante",
        receiptNumber: null,
      }),
    });

    const response = await app.inject({ method: "GET", url: "/purchases", headers });

    expect(response.statusCode).toBe(200);
    const listed = purchaseListSchema.parse(response.json());
    expect(listed.map((purchase) => purchase.lines[0]?.quantity)).toEqual([1_000, 3_000]);
    expect(listed[0]?.lines[0]).toMatchObject({ costPaidCents: 900, unitCostCents: 900 });
  });

  it("lists only the purchases of the session's branch", async () => {
    const { headers, userId } = await buyer();
    const other = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });
    const supplierId = await storedSupplier(userId);
    const { productId } = await insertProduct(db);
    await app.inject({
      method: "POST",
      url: "/purchases",
      headers: other.headers,
      payload: bodyWith(supplierId, [quantityLine(productId)]),
    });

    const response = await app.inject({ method: "GET", url: "/purchases", headers });

    expect(purchaseListSchema.parse(response.json())).toEqual([]);
  });
});
