import { freightListSchema, freightSchema, linkablePurchaseListSchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, freightPurchases, freights } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerFreightsRoutes } from "./freights-routes.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let now = NOW;
let productId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  now = NOW;
  app = Fastify();
  registerFreightsRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => now });
  productId = (await insertProduct(db)).productId;
});

afterEach(async () => {
  await app.close();
});

function freightManager() {
  return signedInWith(db, ["manage_freight"], NOW);
}

function purchaseAt(
  locationId: string,
  actorId: string,
  overrides: Partial<Parameters<typeof insertPurchaseWithLines>[1]> = {},
) {
  return insertPurchaseWithLines(db, {
    locationId,
    actorId,
    lines: [{ productId, costPaidCents: 1_000, quantity: 2_000, quantityPerPackage: 1_000 }],
    ...overrides,
  });
}

function bodyWith(purchaseIds: string[], overrides: object = {}) {
  return {
    date: "2026-10-04",
    amountCents: 12_000,
    description: "Flete a la bodega",
    means: { kind: "carrier", name: "Transportes del Sur" },
    purchaseIds,
    ...overrides,
  };
}

async function nothingWasStored() {
  expect(await db.select().from(freights)).toEqual([]);
  expect(await db.select().from(freightPurchases)).toEqual([]);
  expect(await db.select().from(auditLog)).toEqual([]);
}

describe("POST /freights", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the freight permission, storing nothing", async () => {
    const { headers, userId, locationId } = await signedInWith(db, ["record_purchases"], NOW);
    const { purchaseId } = await purchaseAt(locationId, userId);

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: bodyWith([purchaseId]),
    });

    expect(response.statusCode).toBe(403);
    await nothingWasStored();
  });

  it("rejects an Origin that is not the backoffice's own, storing nothing", async () => {
    const { headers, userId, locationId } = await freightManager();
    const { purchaseId } = await purchaseAt(locationId, userId);

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers: { ...headers, origin: "https://attacker.example" },
      payload: bodyWith([purchaseId]),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    await nothingWasStored();
  });

  it("rejects a body the contract refuses with 400, storing nothing", async () => {
    const { headers } = await freightManager();

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: bodyWith([]),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "purchaseIds" }],
    });
    await nothingWasStored();
  });

  it("records the freight at the session's branch, by the session's user, and answers it", async () => {
    const { headers, userId, locationId } = await freightManager();
    const first = await purchaseAt(locationId, userId);
    const second = await purchaseAt(locationId, userId);

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: bodyWith([second.purchaseId, first.purchaseId]),
    });

    expect(response.statusCode).toBe(201);
    const freight = freightSchema.parse(response.json());
    expect(freight).toEqual({
      id: freight.id,
      date: "2026-10-04",
      amountCents: 12_000,
      description: "Flete a la bodega",
      means: { kind: "carrier", name: "Transportes del Sur" },
      purchaseIds: [first.purchaseId, second.purchaseId].sort(),
      recordedAt: NOW.toISOString(),
    });
    expect(await db.select().from(freights)).toMatchObject([
      { id: freight.id, locationId, actorId: userId, recordedAt: NOW },
    ]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("returns 400 for a freight dated in the future, storing nothing", async () => {
    const { headers, userId, locationId } = await freightManager();
    const { purchaseId } = await purchaseAt(locationId, userId);

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: bodyWith([purchaseId], { date: "2026-10-07" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "date" }],
    });
    await nothingWasStored();
  });

  it("returns 404 when a purchase is not the branch's, storing nothing", async () => {
    const { headers, userId, locationId } = await freightManager();
    const own = await purchaseAt(locationId, userId);
    const foreign = await purchaseAt(await insertLocation(db), userId);

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: bodyWith([own.purchaseId, foreign.purchaseId]),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "purchase_not_found",
      details: [{ field: "purchaseIds" }],
    });
    await nothingWasStored();
  });

  it("returns 409 when the purchases are worth nothing to distribute the freight over, storing nothing", async () => {
    const { headers, userId, locationId } = await freightManager();
    const { purchaseId } = await purchaseAt(locationId, userId, {
      lines: [{ productId, costPaidCents: 0, quantity: 2_000, quantityPerPackage: 1_000 }],
    });

    const response = await app.inject({
      method: "POST",
      url: "/freights",
      headers,
      payload: bodyWith([purchaseId]),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchases_without_value" });
    await nothingWasStored();
  });
});

describe("PUT /freights/:id", () => {
  async function recordedFreight() {
    const recorder = await freightManager();
    const purchase = await purchaseAt(recorder.locationId, recorder.userId);
    const id = await insertFreightRow(db, {
      locationId: recorder.locationId,
      actorId: recorder.userId,
      purchaseIds: [purchase.purchaseId],
      amountCents: 10_000,
      date: "2026-10-01",
      description: "Flete de la semana",
      recordedAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    return { ...recorder, id, purchase };
  }

  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/freights/${MISSING_ID}`,
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the freight permission, changing nothing", async () => {
    const freight = await recordedFreight();
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers,
      payload: bodyWith([freight.purchase.purchaseId]),
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(freights)).toMatchObject([{ amountCents: 10_000 }]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const freight = await recordedFreight();

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: { ...freight.headers, origin: "https://attacker.example" },
      payload: bodyWith([freight.purchase.purchaseId]),
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(freights)).toMatchObject([{ amountCents: 10_000 }]);
  });

  it("returns 400 for an id that is not a record id", async () => {
    const { headers } = await freightManager();

    const response = await app.inject({
      method: "PUT",
      url: "/freights/nope",
      headers,
      payload: bodyWith([MISSING_ID]),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "id" }] });
  });

  it("rejects a body the contract refuses with 400, changing nothing", async () => {
    const freight = await recordedFreight();

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: freight.headers,
      payload: bodyWith([freight.purchase.purchaseId], { amountCents: 0 }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "amountCents" }] });
    expect(await db.select().from(freights)).toMatchObject([{ amountCents: 10_000 }]);
  });

  it("edits the freight and answers it", async () => {
    const freight = await recordedFreight();
    const replacement = await purchaseAt(freight.locationId, freight.userId);

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: freight.headers,
      payload: bodyWith([replacement.purchaseId], {
        amountCents: 15_500,
        means: { kind: "own_trip" },
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(freightSchema.parse(response.json())).toEqual({
      id: freight.id,
      date: "2026-10-04",
      amountCents: 15_500,
      description: "Flete a la bodega",
      means: { kind: "own_trip" },
      purchaseIds: [replacement.purchaseId],
      recordedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(await db.select().from(freightPurchases)).toEqual([
      { freightId: freight.id, purchaseId: replacement.purchaseId },
    ]);
  });

  it("keeps who recorded the freight when another person edits it, and records who edited it", async () => {
    const freight = await recordedFreight();
    const editor = await signedInWith(db, ["manage_freight"], NOW);

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: editor.headers,
      payload: bodyWith([freight.purchase.purchaseId], { amountCents: 13_000 }),
    });

    expect(response.statusCode).toBe(200);
    expect(await db.select().from(freights).where(eq(freights.id, freight.id))).toMatchObject([
      {
        amountCents: 13_000,
        actorId: freight.userId,
        recordedAt: new Date("2026-10-01T12:00:00.000Z"),
      },
    ]);
    expect(await db.select().from(auditLog).orderBy(asc(auditLog.at))).toMatchObject([
      {
        entity: "freight",
        entityId: freight.id,
        actorId: editor.userId,
        at: NOW,
        previousValue: { amountCents: 10_000, date: "2026-10-01" },
        newValue: { amountCents: 13_000, date: "2026-10-04" },
      },
    ]);
    expect(editor.userId).not.toBe(freight.userId);
  });

  it("returns 404 for a freight that does not exist or is another branch's, changing nothing", async () => {
    const freight = await recordedFreight();
    const foreign = await signedInWith(db, ["manage_freight"], NOW, {
      locationId: await insertLocation(db),
    });
    const foreignPurchase = await purchaseAt(foreign.locationId, foreign.userId);

    const missing = await app.inject({
      method: "PUT",
      url: `/freights/${MISSING_ID}`,
      headers: freight.headers,
      payload: bodyWith([freight.purchase.purchaseId]),
    });
    const other = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: foreign.headers,
      payload: bodyWith([foreignPurchase.purchaseId]),
    });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "freight_not_found" });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: "freight_not_found" });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("returns 404 when a purchase is not the branch's, changing nothing", async () => {
    const freight = await recordedFreight();
    const foreign = await purchaseAt(await insertLocation(db), freight.userId);

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: freight.headers,
      payload: bodyWith([foreign.purchaseId]),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    expect(await db.select().from(freights)).toMatchObject([{ amountCents: 10_000 }]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("returns 409 when the purchases are worth nothing, changing nothing", async () => {
    const freight = await recordedFreight();
    const free = await purchaseAt(freight.locationId, freight.userId, {
      lines: [{ productId, costPaidCents: 0, quantity: 2_000, quantityPerPackage: 1_000 }],
    });

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: freight.headers,
      payload: bodyWith([free.purchaseId]),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchases_without_value" });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("returns 400 for a date in the future, changing nothing", async () => {
    const freight = await recordedFreight();

    const response = await app.inject({
      method: "PUT",
      url: `/freights/${freight.id}`,
      headers: freight.headers,
      payload: bodyWith([freight.purchase.purchaseId], { date: "2026-10-07" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ details: [{ field: "date" }] });
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});

describe("GET /freights", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({ method: "GET", url: "/freights" });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the freight permission", async () => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await app.inject({ method: "GET", url: "/freights", headers });

    expect(response.statusCode).toBe(403);
  });

  it("lists the branch's freights of the last 90 days, newest first, with how many and their total", async () => {
    const { headers, userId, locationId } = await freightManager();
    const { purchaseId, supplierId } = await purchaseAt(locationId, userId, {
      supplierName: "Distribuidora Sur",
      purchasedOn: "2026-09-30",
    });
    const newest = await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-10-03",
      amountCents: 25_050,
    });
    const older = await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-07-07",
      amountCents: 1_000,
      means: { kind: "carrier", name: "Transportes del Sur" },
    });
    await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-07-06",
    });
    const foreignLocation = await insertLocation(db);
    const foreign = await purchaseAt(foreignLocation, userId);
    await insertFreightRow(db, {
      locationId: foreignLocation,
      actorId: userId,
      purchaseIds: [foreign.purchaseId],
      date: "2026-10-03",
    });

    const response = await app.inject({ method: "GET", url: "/freights", headers });

    expect(response.statusCode).toBe(200);
    const listed = freightListSchema.parse(response.json());
    expect(listed.items.map(({ id }) => id)).toEqual([newest, older]);
    expect(listed.items[0]?.purchases).toEqual([
      {
        id: purchaseId,
        purchasedOn: "2026-09-30",
        supplier: { id: supplierId, name: "Distribuidora Sur" },
      },
    ]);
    expect(listed.count).toBe(2);
    expect(listed.totalCents).toBe(26_050);
  });

  it("narrows the list to the period and the search it is asked for", async () => {
    const { headers, userId, locationId } = await freightManager();
    const { purchaseId } = await purchaseAt(locationId, userId);
    await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-09-01",
      description: "Flete de yerba",
    });
    const recent = await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-09-20",
      description: "Flete de yerba",
    });
    await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-09-25",
      description: "Viaje",
    });

    const response = await app.inject({
      method: "GET",
      url: "/freights?period=30&search=YERBA",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(freightListSchema.parse(response.json()).items.map(({ id }) => id)).toEqual([recent]);
  });

  it("measures the period from the clock it was given", async () => {
    const { headers, userId, locationId } = await freightManager();
    const { purchaseId } = await purchaseAt(locationId, userId);
    await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [purchaseId],
      date: "2026-07-07",
    });
    now = new Date("2026-10-07T15:00:00.000Z");

    const response = await app.inject({ method: "GET", url: "/freights", headers });

    expect(freightListSchema.parse(response.json()).items).toEqual([]);
  });

  it("returns 400 for a period the list does not offer", async () => {
    const { headers } = await freightManager();

    const response = await app.inject({ method: "GET", url: "/freights?period=7", headers });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /freights/linkable-purchases", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({ method: "GET", url: "/freights/linkable-purchases" });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the freight permission", async () => {
    const { headers } = await signedInWith(db, ["record_purchases"], NOW);

    const response = await app.inject({
      method: "GET",
      url: "/freights/linkable-purchases",
      headers,
    });

    expect(response.statusCode).toBe(403);
  });

  it("lists the branch's purchases of the last 90 days with their value, newest first", async () => {
    const { headers, userId, locationId } = await freightManager();
    const older = await purchaseAt(locationId, userId, { purchasedOn: "2026-07-07" });
    const newer = await purchaseAt(locationId, userId, {
      purchasedOn: "2026-10-01",
      lines: [
        { productId, costPaidCents: 1_000, quantity: 2_000, quantityPerPackage: 1_000 },
        { productId, costPaidCents: 500, quantity: 1_000, quantityPerPackage: 1_000 },
      ],
    });
    await purchaseAt(locationId, userId, { purchasedOn: "2026-07-06" });
    await purchaseAt(await insertLocation(db), userId, { purchasedOn: "2026-10-01" });

    const response = await app.inject({
      method: "GET",
      url: "/freights/linkable-purchases",
      headers,
    });

    expect(response.statusCode).toBe(200);
    const listed = linkablePurchaseListSchema.parse(response.json());
    expect(listed.map(({ id }) => id)).toEqual([newer.purchaseId, older.purchaseId]);
    expect(listed[0]).toMatchObject({ valueCents: 2_500, receiptType: "sin_comprobante" });
  });

  it("adds the purchases a freight already covers, however old, when asked for the freight", async () => {
    const { headers, userId, locationId } = await freightManager();
    const old = await purchaseAt(locationId, userId, { purchasedOn: "2025-01-01" });
    const recent = await purchaseAt(locationId, userId, { purchasedOn: "2026-10-01" });
    const freightId = await insertFreightRow(db, {
      locationId,
      actorId: userId,
      purchaseIds: [old.purchaseId],
    });

    const response = await app.inject({
      method: "GET",
      url: `/freights/linkable-purchases?period=30&freightId=${freightId}`,
      headers,
    });

    expect(linkablePurchaseListSchema.parse(response.json()).map(({ id }) => id)).toEqual([
      recent.purchaseId,
      old.purchaseId,
    ]);
  });

  it("returns 400 for a freight id that is not an id", async () => {
    const { headers } = await freightManager();

    const response = await app.inject({
      method: "GET",
      url: "/freights/linkable-purchases?freightId=nope",
      headers,
    });

    expect(response.statusCode).toBe(400);
  });
});
