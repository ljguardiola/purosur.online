import { purchaseChangesSchema, purchaseSummarySchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  lots,
  purchaseLines,
  purchases,
  stockBalances,
  stockMovements,
  suppliers,
} from "../platform/db/schema.js";
import { DrizzleExpiringLotReader } from "../stock/drizzle-expiring-lot-reader.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerPurchasesRoutes } from "./purchases-routes.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const CORRECTED_AT = new Date("2026-10-05T15:10:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let now = NOW;

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
  registerPurchasesRoutes(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => now,
  });
});

afterEach(async () => {
  await app.close();
});

function quantityLine(productId: string, overrides: object = {}) {
  return {
    loadedBy: "quantity",
    productId,
    quantity: 3_000,
    costPaidCents: 900,
    lotNumber: null,
    expiresOn: null,
    ...overrides,
  };
}

async function buyer() {
  return signedInWith(db, [], NOW, { isAdministrator: true });
}

async function registeredPurchase(
  headers: Record<string, string>,
  userId: string,
  lines: object[],
): Promise<z_PurchaseSummary> {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: "Distribuidora Sur", actorId: userId })
    .returning({ id: suppliers.id });
  const response = await app.inject({
    method: "POST",
    url: "/purchases",
    headers,
    payload: {
      supplierId: supplier?.id,
      purchasedOn: "2026-10-04",
      receiptType: "factura_b",
      receiptNumber: "0001-00001234",
      note: null,
      lines,
    },
  });
  expect(response.statusCode).toBe(201);
  now = CORRECTED_AT;
  return purchaseSummarySchema.parse(response.json());
}

type z_PurchaseSummary = ReturnType<typeof purchaseSummarySchema.parse>;

const headerBody = (overrides: object = {}) => ({
  purchasedOn: "2026-10-04",
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: null,
  ...overrides,
});

describe("POST /purchases/:purchaseId/lines", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/purchases/${MISSING_ID}/lines`,
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 to a user without the purchases permission, adding nothing", async () => {
    const owner = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(owner.headers, owner.userId, [
      quantityLine(yerba.productId),
    ]);
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${purchase.id}/lines`,
      headers,
      payload: { lines: [quantityLine(yerba.productId)] },
    });

    expect(response.statusCode).toBe(403);
    expect(await db.select().from(purchaseLines)).toHaveLength(1);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await buyer();

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${MISSING_ID}/lines`,
      headers: { ...headers, origin: "https://attacker.example" },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a body the contract refuses with 400", async () => {
    const { headers } = await buyer();

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${MISSING_ID}/lines`,
      headers,
      payload: { lines: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("adds the line, enters its stock in a new lot dated by the purchase and keeps the other lines as they were", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    const purchase = await registeredPurchase(headers, userId, [
      quantityLine(yerba.productId, { quantity: 2_000, expiresOn: "2026-11-10" }),
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${purchase.id}/lines`,
      headers,
      payload: { lines: [quantityLine(harina.productId, { quantity: 10_000 })] },
    });

    expect(response.statusCode).toBe(201);
    const summary = purchaseSummarySchema.parse(response.json());
    expect(summary.lines.map((line) => [line.product.name, line.quantity])).toEqual([
      ["Yerba", 2_000],
      ["Harina", 10_000],
    ]);
    expect(summary.lines[0]).toEqual(purchase.lines[0]);
    const storedLots = await db.select().from(lots).orderBy(asc(lots.quantityReceived));
    expect(storedLots).toMatchObject([
      { productId: yerba.productId, quantityReceived: 2_000, purchasedOn: "2026-10-04" },
      { productId: harina.productId, quantityReceived: 10_000, purchasedOn: "2026-10-04" },
    ]);
    const [balance] = await db
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.productId, harina.productId));
    expect(balance?.quantity).toBe(10_000);
    const [movement] = await db
      .select({ occurredAt: stockMovements.occurredAt })
      .from(stockMovements)
      .where(eq(stockMovements.productId, harina.productId));
    expect(movement?.occurredAt).toEqual(CORRECTED_AT);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toHaveLength(1);
  });

  it("answers 404 for a purchase of another branch, adding nothing", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${purchase.id}/lines`,
      headers: otherBranch.headers,
      payload: { lines: [quantityLine(yerba.productId)] },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    expect(await db.select().from(purchaseLines)).toHaveLength(1);
  });

  it("answers 400 for a quantity the product may not be received in, changing nothing", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${purchase.id}/lines`,
      headers,
      payload: { lines: [quantityLine(yerba.productId, { quantity: 1_500 })] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      message: "the line's quantity is not one its product may be received in",
      details: [{ field: "lines", lineIndex: 0 }],
    });
    expect(await db.select().from(purchaseLines)).toHaveLength(1);
    expect(await db.select().from(lots)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("answers 404 for a product that does not exist, with the line's index", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${purchase.id}/lines`,
      headers,
      payload: { lines: [quantityLine(MISSING_ID)] },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "product_not_found",
      details: [{ field: "lines", lineIndex: 0 }],
    });
  });
});

describe("PATCH /purchases/:purchaseId", () => {
  it("returns 403 to a user without the purchases permission, changing nothing", async () => {
    const owner = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(owner.headers, owner.userId, [
      quantityLine(yerba.productId),
    ]);
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}`,
      headers,
      payload: headerBody({ receiptNumber: "0001-00001243" }),
    });

    expect(response.statusCode).toBe(403);
    const [row] = await db.select().from(purchases);
    expect(row?.receiptNumber).toBe("0001-00001234");
  });

  it("corrects the receipt number and the date, answering the purchase with them", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}`,
      headers,
      payload: headerBody({ receiptNumber: "0001-00001243", purchasedOn: "2026-10-03" }),
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseSummarySchema.parse(response.json())).toMatchObject({
      id: purchase.id,
      receiptNumber: "0001-00001243",
      purchasedOn: "2026-10-03",
    });
    const [lot] = await db.select({ purchasedOn: lots.purchasedOn }).from(lots);
    expect(lot?.purchasedOn).toBe("2026-10-03");
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toHaveLength(1);
  });

  it("answers 409 purchase_unchanged and records nothing when nothing changes", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}`,
      headers,
      payload: headerBody(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "purchase_unchanged" });
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("answers 400 for a date in the future, with the message of registering, changing nothing", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}`,
      headers,
      payload: headerBody({ purchasedOn: "2026-10-07" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      message: "a purchase cannot be dated in the future",
      details: [{ field: "purchasedOn" }],
    });
    const [row] = await db.select().from(purchases);
    expect(row?.purchasedOn).toBe("2026-10-04");
  });

  it("answers 404 for a purchase of another branch", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}`,
      headers: otherBranch.headers,
      payload: headerBody({ note: "Otra" }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
  });
});

describe("PATCH /purchases/:purchaseId/lines/:lineId/expiry", () => {
  it("moves the lot's expiry date, keeps what remains, and the expiring lots no longer list the old date", async () => {
    const { headers, userId, locationId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [
      quantityLine(yerba.productId, { quantity: 5_000, expiresOn: "2026-11-10" }),
    ]);
    await db.update(lots).set({ remaining: 3_000 });
    const expiringBefore = await new DrizzleExpiringLotReader(db).lotsExpiringBy(
      locationId,
      "2026-12-31",
    );
    expect(expiringBefore).toHaveLength(1);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${purchase.lines[0]?.id}/expiry`,
      headers,
      payload: { expiresOn: "2027-11-10" },
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseSummarySchema.parse(response.json()).lines[0]?.expiresOn).toBe("2027-11-10");
    const [lot] = await db.select().from(lots);
    expect(lot).toMatchObject({ expiresOn: "2027-11-10", remaining: 3_000 });
    expect(await new DrizzleExpiringLotReader(db).lotsExpiringBy(locationId, "2026-12-31")).toEqual(
      [],
    );
  });

  it("clears the expiry date when the body names none", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [
      quantityLine(yerba.productId, { expiresOn: "2026-11-10" }),
    ]);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${purchase.lines[0]?.id}/expiry`,
      headers,
      payload: { expiresOn: null },
    });

    expect(response.statusCode).toBe(200);
    const [lot] = await db.select().from(lots);
    expect(lot?.expiresOn).toBeNull();
  });

  it("answers 409 expiry_unchanged and records nothing when the line already has that date", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [
      quantityLine(yerba.productId, { expiresOn: "2026-11-10" }),
    ]);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${purchase.lines[0]?.id}/expiry`,
      headers,
      payload: { expiresOn: "2026-11-10" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "expiry_unchanged" });
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("returns 403 to a user without the purchases permission", async () => {
    const owner = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(owner.headers, owner.userId, [
      quantityLine(yerba.productId, { expiresOn: "2026-11-10" }),
    ]);
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${purchase.lines[0]?.id}/expiry`,
      headers,
      payload: { expiresOn: "2027-11-10" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("answers 404 for a line that is not of the purchase", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${MISSING_ID}/expiry`,
      headers,
      payload: { expiresOn: "2027-11-10" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "line_not_found" });
  });

  it("answers 404 for a purchase of another branch, changing nothing", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [
      quantityLine(yerba.productId, { expiresOn: "2026-11-10" }),
    ]);
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${purchase.lines[0]?.id}/expiry`,
      headers: otherBranch.headers,
      payload: { expiresOn: "2027-11-10" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    const [lot] = await db.select().from(lots);
    expect(lot?.expiresOn).toBe("2026-11-10");
  });
});

describe("GET /purchases/:purchaseId/changes", () => {
  it("lists who changed what and when, newest first", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [
      quantityLine(yerba.productId, { expiresOn: "2026-11-10" }),
    ]);
    await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}`,
      headers,
      payload: headerBody({ receiptNumber: "0001-00001243" }),
    });
    now = new Date("2026-10-05T15:20:00.000Z");
    await app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${purchase.lines[0]?.id}/expiry`,
      headers,
      payload: { expiresOn: "2027-11-10" },
    });

    const response = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseChangesSchema.parse(response.json())).toEqual([
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: "2026-10-05T15:20:00.000Z",
        change: {
          kind: "line_expiry",
          lineId: purchase.lines[0]?.id,
          previous: "2026-11-10",
          next: "2027-11-10",
        },
      },
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: CORRECTED_AT.toISOString(),
        change: {
          kind: "header",
          changes: [{ field: "receiptNumber", previous: "0001-00001234", next: "0001-00001243" }],
        },
      },
    ]);
  });

  it("returns 403 to a user without the purchases permission", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({
      method: "GET",
      url: `/purchases/${MISSING_ID}/changes`,
      headers,
    });

    expect(response.statusCode).toBe(403);
  });

  it("answers 404 for a purchase of another branch", async () => {
    const { headers, userId } = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(headers, userId, [quantityLine(yerba.productId)]);
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers: otherBranch.headers,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
  });
});
