import {
  priceMarginSchema,
  purchaseChangesSchema,
  purchaseSummarySchema,
} from "@purosur/contracts";
import { recordLoss, registerCount } from "@purosur/domain/stock/use-cases";
import { asc, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  lotCostChanges,
  lots,
  purchaseLines,
  purchases,
  stockBalances,
  stockMovements,
  suppliers,
} from "../platform/db/schema.js";
import { registerPriceMarginRoute } from "../pricing/price-margin-route.js";
import { DrizzleExpiringLotReader } from "../stock/drizzle-expiring-lot-reader.js";
import { DrizzleStockStore } from "../stock/drizzle-stock-store.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzlePurchaseCostReader } from "./drizzle-purchase-cost-reader.js";
import { registerPurchasesRoutes } from "./purchases-routes.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const CORRECTED_AT = new Date("2026-10-05T15:10:00.000Z");
const CORRECTED_LATER = new Date("2026-10-05T15:20:00.000Z");
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
  const options = {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => now,
  };
  registerPurchasesRoutes(app, options);
  registerPriceMarginRoute(app, options);
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

describe("POST /purchases/:purchaseId/lines/:lineId/expiry-splits", () => {
  async function juicePurchase() {
    const session = await buyer();
    const juice = await insertProduct(db, { name: "Jugo" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      quantityLine(juice.productId, { quantity: 5_000, expiresOn: "2026-11-10" }),
    ]);
    return { ...session, purchase };
  }

  function split(
    headers: Record<string, string>,
    purchase: z_PurchaseSummary,
    payload: object,
    lineId: string | undefined = purchase.lines[0]?.id,
  ) {
    return app.inject({
      method: "POST",
      url: `/purchases/${purchase.id}/lines/${lineId}/expiry-splits`,
      headers,
      payload,
    });
  }

  it("moves the units into a lot of their own and answers the purchase with what remains in the line's lot", async () => {
    const { headers, purchase } = await juicePurchase();

    const response = await split(headers, purchase, { quantity: 2_000, expiresOn: "2027-01-15" });

    expect(response.statusCode).toBe(200);
    const line = purchaseSummarySchema.parse(response.json()).lines[0];
    expect(line).toMatchObject({ quantity: 5_000, expiresOn: "2026-11-10", remainingInLot: 3_000 });
    const stored = await db.select().from(lots).orderBy(asc(lots.nameOrder));
    expect(stored.map(({ expiresOn, remaining }) => [expiresOn, remaining])).toEqual([
      ["2026-11-10", 3_000],
      ["2027-01-15", 2_000],
    ]);
  });

  it("lists the purchase's lines once each after a split", async () => {
    const { headers, purchase } = await juicePurchase();
    await split(headers, purchase, { quantity: 2_000, expiresOn: "2027-01-15" });

    const response = await app.inject({ method: "GET", url: "/purchases", headers });

    expect(response.statusCode).toBe(200);
    expect(purchaseSummarySchema.parse((response.json() as unknown[])[0]).lines).toHaveLength(1);
  });

  it("records the units, the previous and new date, who and when, and the purchase's changes list them", async () => {
    const { headers, userId, purchase } = await juicePurchase();
    await split(headers, purchase, { quantity: 2_000, expiresOn: "2027-01-15" });

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId: userId,
        at: CORRECTED_AT,
        newValue: expect.objectContaining({ kind: "line_expiry_split", quantity: 2_000 }),
      }),
    ]);
    const response = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers,
    });
    expect(purchaseChangesSchema.parse(response.json())).toEqual([
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: CORRECTED_AT.toISOString(),
        change: {
          kind: "line_expiry_split",
          lineId: purchase.lines[0]?.id,
          product: purchase.lines[0]?.product,
          quantity: 2_000,
          previous: "2026-11-10",
          next: "2027-01-15",
        },
      },
    ]);
  });

  it("answers 409 expiry_unchanged and records nothing when the date is the line's own", async () => {
    const { headers, purchase } = await juicePurchase();

    const response = await split(headers, purchase, { quantity: 2_000, expiresOn: "2026-11-10" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "expiry_unchanged" });
    expect(await db.select().from(lots)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("answers 409 not_enough_in_lot and changes nothing when the lot has no more units than asked", async () => {
    const { headers, purchase } = await juicePurchase();
    await db.update(lots).set({ remaining: 2_000 });

    const response = await split(headers, purchase, { quantity: 2_000, expiresOn: "2027-01-15" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "not_enough_in_lot",
      message: expect.any(String),
    });
    expect(await db.select().from(lots)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
    expect(
      await db.select().from(stockMovements).where(eq(stockMovements.kind, "lot_split")),
    ).toEqual([]);
  });

  it("answers 400 on the quantity and changes nothing when it is part of a unit of a product sold by the unit", async () => {
    const { headers, purchase } = await juicePurchase();

    const response = await split(headers, purchase, { quantity: 1_500, expiresOn: "2027-01-15" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantity" }],
    });
    expect(await db.select().from(lots)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it.each([{}, { quantity: 0, expiresOn: "2027-01-15" }, { quantity: 1_000, expiresOn: "x" }])(
    "answers 400 to the body %j",
    async (payload) => {
      const { headers, purchase } = await juicePurchase();

      const response = await split(headers, purchase, payload);

      expect(response.statusCode).toBe(400);
    },
  );

  it("answers 403 to a user without the purchases permission before reading any purchase", async () => {
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const response = await app.inject({
      method: "POST",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/expiry-splits`,
      headers,
      payload: { quantity: 1_000, expiresOn: "2027-01-15" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("answers 404 for a line that is not of the purchase", async () => {
    const { headers, purchase } = await juicePurchase();

    const response = await split(
      headers,
      purchase,
      { quantity: 1_000, expiresOn: "2027-01-15" },
      MISSING_ID,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "line_not_found" });
  });

  it("answers 404 for a purchase of another branch, changing nothing", async () => {
    const { purchase } = await juicePurchase();
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await split(otherBranch.headers, purchase, {
      quantity: 1_000,
      expiresOn: "2027-01-15",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    expect(await db.select().from(lots)).toHaveLength(1);
  });
});

describe("PATCH /purchases/:purchaseId/lines/:lineId/cost", () => {
  async function purchaseOfOneLine(overrides: object = {}) {
    const session = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      quantityLine(yerba.productId, { quantity: 10_000, costPaidCents: 900, ...overrides }),
    ]);
    return { ...session, productId: yerba.productId, purchase };
  }

  function correctCost(
    headers: Record<string, string>,
    purchase: z_PurchaseSummary,
    payload: object,
    lineId: string | undefined = purchase.lines[0]?.id,
  ) {
    return app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${lineId}/cost`,
      headers,
      payload,
    });
  }

  it("corrects the line's cost and its lot's, keeping the cost it had and what remains of the lot", async () => {
    const { headers, purchase } = await purchaseOfOneLine({ expiresOn: "2026-11-10" });
    await db.update(lots).set({ remaining: 6_000 });

    const response = await correctCost(headers, purchase, { costPaidCents: 1_200 });

    expect(response.statusCode).toBe(200);
    expect(purchaseSummarySchema.parse(response.json()).lines[0]?.costPaidCents).toBe(1_200);
    const [lot] = await db.select().from(lots);
    expect(lot).toMatchObject({
      costTotalCents: 1_200,
      costQuantity: 1_000,
      remaining: 6_000,
      quantityReceived: 10_000,
      expiresOn: "2026-11-10",
    });
    const [line] = await db.select().from(purchaseLines);
    expect(line).toMatchObject({ quantity: 10_000, expiresOn: "2026-11-10" });
    expect(await db.select().from(lotCostChanges)).toEqual([
      {
        id: expect.any(String),
        lotId: lot?.id,
        changedAt: CORRECTED_AT,
        previousCostTotalCents: 900,
        previousCostQuantity: 1_000,
      },
    ]);
  });

  it("makes the product's last cost the corrected cost when the line is its latest purchase", async () => {
    const { headers, locationId, productId, purchase } = await purchaseOfOneLine();

    await correctCost(headers, purchase, { costPaidCents: 1_200 });

    expect(
      await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [productId]),
    ).toEqual([expect.objectContaining({ cost: { totalCents: 1_200, quantity: 1_000 } })]);
  });

  it("keeps the product's last cost at its latest purchase when an older line's cost is corrected", async () => {
    const { headers, productId, purchase: older } = await purchaseOfOneLine();
    const latest = await app.inject({
      method: "POST",
      url: "/purchases",
      headers,
      payload: {
        supplierId: older.supplier.id,
        purchasedOn: "2026-10-04",
        receiptType: "factura_b",
        receiptNumber: "0001-00001235",
        note: null,
        lines: [quantityLine(productId, { costPaidCents: 1_500 })],
      },
    });
    expect(latest.statusCode).toBe(201);
    now = CORRECTED_LATER;

    const correction = await correctCost(headers, older, { costPaidCents: 1_200 });
    const margin = await app.inject({
      method: "GET",
      url: `/prices/${productId}/margin?unitPrice=2000`,
      headers,
    });

    expect(correction.statusCode).toBe(200);
    expect(priceMarginSchema.parse(margin.json()).costReference).toMatchObject({
      lastCostCents: 1_500,
    });
  });

  it("records who corrected the cost, when, and the previous and new cost, listed among the purchase's changes", async () => {
    const { headers, userId, purchase } = await purchaseOfOneLine();

    await correctCost(headers, purchase, { costPaidCents: 1_200 });

    const audit = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      entityId: purchase.id,
      actorId: userId,
      at: CORRECTED_AT,
    });
    const changes = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers,
    });
    expect(purchaseChangesSchema.parse(changes.json())).toEqual([
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: CORRECTED_AT.toISOString(),
        change: {
          kind: "line_cost",
          lineId: purchase.lines[0]?.id,
          product: purchase.lines[0]?.product,
          previous: 900,
          next: 1_200,
        },
      },
    ]);
  });

  it("answers 409 cost_unchanged and records nothing when the line already has that cost", async () => {
    const { headers, purchase } = await purchaseOfOneLine();

    const response = await correctCost(headers, purchase, { costPaidCents: 900 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "cost_unchanged" });
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
    expect(await db.select().from(lotCostChanges)).toEqual([]);
  });

  it.each([{ costPaidCents: -1 }, { costPaidCents: 1.5 }, { costPaidCents: "9" }, {}])(
    "answers 400 for the body %j, changing nothing",
    async (payload) => {
      const { headers, purchase } = await purchaseOfOneLine();

      const response = await correctCost(headers, purchase, payload);

      expect(response.statusCode).toBe(400);
      const [line] = await db.select().from(purchaseLines);
      expect(line?.costPaidCents).toBe(900);
    },
  );

  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/cost`,
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: { costPaidCents: 1 },
    });

    expect(response.statusCode).toBe(401);
  });

  it("refuses a user without the purchases permission before reading the purchase", async () => {
    const { purchase } = await purchaseOfOneLine();
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const existing = await correctCost(headers, purchase, { costPaidCents: 1_200 });
    const missing = await app.inject({
      method: "PATCH",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/cost`,
      headers,
      payload: { costPaidCents: 1_200 },
    });

    expect(existing.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    const [line] = await db.select().from(purchaseLines);
    expect(line?.costPaidCents).toBe(900);
  });

  it("answers 404 for a line that is not of the purchase", async () => {
    const { headers, purchase } = await purchaseOfOneLine();

    const response = await correctCost(headers, purchase, { costPaidCents: 1_200 }, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "line_not_found" });
  });

  it("answers 404 for a purchase of another branch, changing nothing", async () => {
    const { purchase } = await purchaseOfOneLine();
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await correctCost(otherBranch.headers, purchase, { costPaidCents: 1_200 });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    const [lot] = await db.select().from(lots);
    expect(lot?.costTotalCents).toBe(900);
  });
});

describe("PATCH /purchases/:purchaseId/lines/:lineId/quantity", () => {
  async function purchaseOfOneLine(line: (productId: string) => object) {
    const session = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      line(yerba.productId),
    ]);
    return { ...session, productId: yerba.productId, purchase };
  }

  const tenUnits = (productId: string) =>
    quantityLine(productId, { quantity: 10_000, costPaidCents: 900, expiresOn: "2026-11-10" });

  function correctQuantity(
    headers: Record<string, string>,
    purchase: z_PurchaseSummary,
    payload: object,
    lineId: string | undefined = purchase.lines[0]?.id,
  ) {
    return app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${lineId}/quantity`,
      headers,
      payload,
    });
  }

  it("corrects the line's quantity and its lot's, answering the purchase with what remains in the lot", async () => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);
    await db.update(lots).set({ remaining: 6_000 });

    const response = await correctQuantity(headers, purchase, {
      loadedBy: "quantity",
      quantity: 8_000,
    });

    expect(response.statusCode).toBe(200);
    expect(purchaseSummarySchema.parse(response.json()).lines[0]).toMatchObject({
      quantity: 8_000,
      remainingInLot: 4_000,
    });
    const [lot] = await db.select().from(lots);
    expect(lot).toMatchObject({ remaining: 4_000, quantityReceived: 8_000, costTotalCents: 900 });
    const [line] = await db.select().from(purchaseLines);
    expect(line).toMatchObject({ quantity: 8_000, costPaidCents: 900, expiresOn: "2026-11-10" });
    const [balance] = await db.select().from(stockBalances);
    expect(balance?.quantity).toBe(8_000);
  });

  it("corrects a line loaded by packages by its packages", async () => {
    const { headers, purchase } = await purchaseOfOneLine((productId) => ({
      loadedBy: "packages",
      productId,
      packages: 2,
      quantityPerPackage: 5_000,
      costPaidCents: 900,
      expiresOn: null,
    }));

    const response = await correctQuantity(headers, purchase, {
      loadedBy: "packages",
      packages: 3,
    });

    expect(response.statusCode).toBe(200);
    const [line] = await db.select().from(purchaseLines);
    expect(line).toMatchObject({ packages: 3, quantity: 15_000, quantityPerPackage: 5_000 });
  });

  it("records who corrected the quantity, when, and the previous and new quantity, listed among the purchase's changes", async () => {
    const { headers, userId, purchase } = await purchaseOfOneLine(tenUnits);
    await correctQuantity(headers, purchase, { loadedBy: "quantity", quantity: 12_000 });

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId: userId,
        at: CORRECTED_AT,
        newValue: expect.objectContaining({ kind: "line_quantity", quantity: 12_000 }),
      }),
    ]);
    const response = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers,
    });
    expect(purchaseChangesSchema.parse(response.json())).toEqual([
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: CORRECTED_AT.toISOString(),
        change: {
          kind: "line_quantity",
          lineId: purchase.lines[0]?.id,
          product: purchase.lines[0]?.product,
          previous: { quantity: 10_000, packages: null },
          next: { quantity: 12_000, packages: null },
        },
      },
    ]);
  });

  it("answers 409 quantity_unchanged and records nothing when the line already has that quantity", async () => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);

    const response = await correctQuantity(headers, purchase, {
      loadedBy: "quantity",
      quantity: 10_000,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "quantity_unchanged" });
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("answers 409 not_enough_in_lot and changes nothing when units already left the lot", async () => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);
    await db.update(lots).set({ remaining: 6_000 });

    const response = await correctQuantity(headers, purchase, {
      loadedBy: "quantity",
      quantity: 3_000,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "not_enough_in_lot",
      message: expect.any(String),
    });
    const [line] = await db.select().from(purchaseLines);
    expect(line?.quantity).toBe(10_000);
    const [lot] = await db.select().from(lots);
    expect(lot).toMatchObject({ remaining: 6_000, quantityReceived: 10_000 });
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("answers 400 on the quantity when the product is not sold in part of a unit", async () => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);

    const response = await correctQuantity(headers, purchase, {
      loadedBy: "quantity",
      quantity: 10_500,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "quantity" }],
    });
    const [line] = await db.select().from(purchaseLines);
    expect(line?.quantity).toBe(10_000);
  });

  it("answers 400 on the packages when the line was not loaded by packages", async () => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);

    const response = await correctQuantity(headers, purchase, {
      loadedBy: "packages",
      packages: 3,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "packages" }],
    });
  });

  it.each([
    {},
    { loadedBy: "quantity", quantity: 0 },
    { loadedBy: "quantity", quantity: 1.5 },
    { loadedBy: "packages", packages: -1 },
    { loadedBy: "other", quantity: 1_000 },
  ])("answers 400 to the body %j", async (payload) => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);

    const response = await correctQuantity(headers, purchase, payload);

    expect(response.statusCode).toBe(400);
  });

  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/quantity`,
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: { loadedBy: "quantity", quantity: 1_000 },
    });

    expect(response.statusCode).toBe(401);
  });

  it("refuses a user without the purchases permission before reading the purchase", async () => {
    const { purchase } = await purchaseOfOneLine(tenUnits);
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const existing = await correctQuantity(headers, purchase, {
      loadedBy: "quantity",
      quantity: 8_000,
    });
    const missing = await app.inject({
      method: "PATCH",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/quantity`,
      headers,
      payload: { loadedBy: "quantity", quantity: 8_000 },
    });

    expect(existing.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    const [line] = await db.select().from(purchaseLines);
    expect(line?.quantity).toBe(10_000);
  });

  it("answers 404 for a line that is not of the purchase", async () => {
    const { headers, purchase } = await purchaseOfOneLine(tenUnits);

    const response = await correctQuantity(
      headers,
      purchase,
      { loadedBy: "quantity", quantity: 8_000 },
      MISSING_ID,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "line_not_found" });
  });

  it("answers 404 for a purchase of another branch, changing nothing", async () => {
    const { purchase } = await purchaseOfOneLine(tenUnits);
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await correctQuantity(otherBranch.headers, purchase, {
      loadedBy: "quantity",
      quantity: 8_000,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    const [lot] = await db.select().from(lots);
    expect(lot?.quantityReceived).toBe(10_000);
  });
});

async function lossFromStock(actorId: string, productId: string) {
  const [lot] = await db.select().from(lots).where(eq(lots.productId, productId));
  const outcome = await recordLoss(
    { store: new DrizzleStockStore(db), clock: { now: () => now } },
    {
      productId,
      locationId: lot?.locationId as string,
      reason: "spoiled",
      quantity: 1_000,
      actorId,
    },
  );
  expect(outcome.kind).toBe("recorded");
}

async function countOf(actorId: string, productId: string, counted: number) {
  const [lot] = await db.select().from(lots).where(eq(lots.productId, productId));
  const outcome = await registerCount(
    { store: new DrizzleStockStore(db), clock: { now: () => now } },
    {
      productId,
      locationId: lot?.locationId as string,
      counted,
      occurredAt: CORRECTED_AT,
      actorId,
    },
  );
  expect(outcome.kind).toBe("recorded");
}

describe("PATCH /purchases/:purchaseId/lines/:lineId/product", () => {
  async function purchaseOfTwoLines() {
    const session = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba", brandName: "Piragüé" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      quantityLine(yerba.productId, { quantity: 10_000, expiresOn: "2026-11-10" }),
      quantityLine(yerba.productId, { quantity: 2_000 }),
    ]);
    return { ...session, yerba, harina, purchase };
  }

  function changeProduct(
    headers: Record<string, string>,
    purchase: z_PurchaseSummary,
    payload: object,
    lineId: string | undefined = purchase.lines[0]?.id,
  ) {
    return app.inject({
      method: "PATCH",
      url: `/purchases/${purchase.id}/lines/${lineId}/product`,
      headers,
      payload,
    });
  }

  it("moves the line to the product, answering the purchase with the line on it", async () => {
    const { headers, harina, purchase } = await purchaseOfTwoLines();

    const response = await changeProduct(headers, purchase, { productId: harina.productId });

    expect(response.statusCode).toBe(200);
    const summary = purchaseSummarySchema.parse(response.json());
    expect(summary.lines.map((line) => line.product.name)).toEqual(["Harina", "Yerba"]);
    const [lot] = await db.select().from(lots).where(eq(lots.productId, harina.productId));
    expect(lot).toMatchObject({ remaining: 10_000, expiresOn: "2026-11-10" });
  });

  it("lists the change among the purchase's changes with the products described", async () => {
    const { headers, userId, yerba, harina, purchase } = await purchaseOfTwoLines();
    await changeProduct(headers, purchase, { productId: harina.productId });

    const response = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers,
    });

    expect(purchaseChangesSchema.parse(response.json())).toEqual([
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: CORRECTED_AT.toISOString(),
        change: {
          kind: "line_product",
          lineId: purchase.lines[0]?.id,
          previous: {
            id: yerba.productId,
            name: "Yerba",
            brandName: "Piragüé",
            netContent: null,
            saleUnit: "UNIT",
          },
          next: {
            id: harina.productId,
            name: "Harina",
            brandName: null,
            netContent: null,
            saleUnit: "KG",
          },
        },
      },
    ]);
  });

  it("answers 409 product_unchanged when the line already has that product", async () => {
    const { headers, yerba, purchase } = await purchaseOfTwoLines();

    const response = await changeProduct(headers, purchase, { productId: yerba.productId });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "product_unchanged" });
  });

  it("answers 404 product_not_found for a product that does not exist", async () => {
    const { headers, purchase } = await purchaseOfTwoLines();

    const response = await changeProduct(headers, purchase, { productId: MISSING_ID });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "product_not_found",
      details: [{ field: "productId" }],
    });
  });

  it("answers 409 product_inactive for a deactivated product", async () => {
    const { headers, purchase } = await purchaseOfTwoLines();
    const retired = await insertProduct(db, { name: "Retirado", active: false });

    const response = await changeProduct(headers, purchase, { productId: retired.productId });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "product_inactive" });
  });

  it("answers 400 for a product the line's quantity may not be received in", async () => {
    const session = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      quantityLine(harina.productId, { quantity: 1_500 }),
    ]);

    const response = await changeProduct(session.headers, purchase, {
      productId: yerba.productId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "productId" }],
    });
  });

  it("answers 409 units_left_lot when some unit of the line left its lot, changing nothing", async () => {
    const { headers, userId, yerba, harina, purchase } = await purchaseOfTwoLines();
    await lossFromStock(userId, yerba.productId);

    const response = await changeProduct(headers, purchase, { productId: harina.productId });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "units_left_lot" });
    const [line] = await db.select().from(purchaseLines).orderBy(asc(purchaseLines.position));
    expect(line?.productId).toBe(yerba.productId);
  });

  it.each([{}, { productId: "nope" }, { productId: 7 }])(
    "answers 400 to the body %j",
    async (payload) => {
      const { headers, purchase } = await purchaseOfTwoLines();

      const response = await changeProduct(headers, purchase, payload);

      expect(response.statusCode).toBe(400);
    },
  );

  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/product`,
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: { productId: MISSING_ID },
    });

    expect(response.statusCode).toBe(401);
  });

  it("refuses a user without the purchases permission before reading the purchase", async () => {
    const { harina, purchase } = await purchaseOfTwoLines();
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const existing = await changeProduct(headers, purchase, { productId: harina.productId });
    const missing = await app.inject({
      method: "PATCH",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}/product`,
      headers,
      payload: { productId: harina.productId },
    });

    expect(existing.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    const [line] = await db.select().from(purchaseLines).orderBy(asc(purchaseLines.position));
    expect(line?.productId).not.toBe(harina.productId);
  });

  it("answers 404 for a line that is not of the purchase", async () => {
    const { headers, harina, purchase } = await purchaseOfTwoLines();

    const response = await changeProduct(
      headers,
      purchase,
      { productId: harina.productId },
      MISSING_ID,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "line_not_found" });
  });

  it("answers 404 for a purchase of another branch, changing nothing", async () => {
    const { harina, purchase } = await purchaseOfTwoLines();
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await changeProduct(otherBranch.headers, purchase, {
      productId: harina.productId,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
  });
});

describe("DELETE /purchases/:purchaseId/lines/:lineId", () => {
  async function purchaseOfTwoLines() {
    const session = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba", brandName: "Piragüé" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      quantityLine(yerba.productId, { quantity: 10_000, expiresOn: "2026-11-10" }),
      quantityLine(harina.productId, { quantity: 2_000 }),
    ]);
    return { ...session, yerba, harina, purchase };
  }

  function removeLine(
    headers: Record<string, string>,
    purchase: z_PurchaseSummary,
    lineId: string | undefined = purchase.lines[0]?.id,
  ) {
    return app.inject({
      method: "DELETE",
      url: `/purchases/${purchase.id}/lines/${lineId}`,
      headers,
    });
  }

  it("removes the line, answering the purchase without it and taking its units out of stock", async () => {
    const { headers, yerba, purchase } = await purchaseOfTwoLines();

    const response = await removeLine(headers, purchase);

    expect(response.statusCode).toBe(200);
    const summary = purchaseSummarySchema.parse(response.json());
    expect(summary.lines.map((line) => line.product.name)).toEqual(["Harina"]);
    const [balance] = await db
      .select()
      .from(stockBalances)
      .where(eq(stockBalances.productId, yerba.productId));
    expect(balance?.quantity).toBe(0);
  });

  it("lists the removal among the purchase's changes with the product described", async () => {
    const { headers, userId, yerba, purchase } = await purchaseOfTwoLines();
    await removeLine(headers, purchase);

    const response = await app.inject({
      method: "GET",
      url: `/purchases/${purchase.id}/changes`,
      headers,
    });

    expect(purchaseChangesSchema.parse(response.json())).toEqual([
      {
        id: expect.any(String),
        actor: { id: userId, name: expect.any(String) },
        correctedAt: CORRECTED_AT.toISOString(),
        change: {
          kind: "line_removed",
          lineId: purchase.lines[0]?.id,
          product: {
            id: yerba.productId,
            name: "Yerba",
            brandName: "Piragüé",
            netContent: null,
            saleUnit: "UNIT",
          },
          quantity: 10_000,
          packages: null,
          costPaidCents: 900,
          expiresOn: "2026-11-10",
        },
      },
    ]);
  });

  it("answers 409 last_line for the only line of the purchase, changing nothing", async () => {
    const session = await buyer();
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registeredPurchase(session.headers, session.userId, [
      quantityLine(yerba.productId),
    ]);

    const response = await removeLine(session.headers, purchase);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "last_line" });
    expect((await db.select().from(purchaseLines))[0]?.removedAt).toBeNull();
  });

  it("answers 409 counted_since_receipt when the product was counted after the line was received", async () => {
    const { headers, userId, yerba, purchase } = await purchaseOfTwoLines();
    await countOf(userId, yerba.productId, 10_000);

    const response = await removeLine(headers, purchase);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "counted_since_receipt" });
    expect((await db.select().from(purchaseLines))[0]?.removedAt).toBeNull();
  });

  it("answers 409 units_left_lot when some unit of the line left its lot, changing nothing", async () => {
    const { headers, userId, yerba, purchase } = await purchaseOfTwoLines();
    await lossFromStock(userId, yerba.productId);

    const response = await removeLine(headers, purchase);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "units_left_lot" });
    expect((await db.select().from(purchaseLines))[0]?.removedAt).toBeNull();
  });

  it("returns 401 when no session cookie was sent", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}`,
      headers: { origin: BACKOFFICE_ORIGIN },
    });

    expect(response.statusCode).toBe(401);
  });

  it("refuses a user without the purchases permission before reading the purchase", async () => {
    const { purchase } = await purchaseOfTwoLines();
    const { headers } = await signedInWith(db, ["sell_and_charge"], NOW);

    const existing = await removeLine(headers, purchase);
    const missing = await app.inject({
      method: "DELETE",
      url: `/purchases/${MISSING_ID}/lines/${MISSING_ID}`,
      headers,
    });

    expect(existing.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    expect((await db.select().from(purchaseLines))[0]?.removedAt).toBeNull();
  });

  it("answers 404 for a line that is not of the purchase", async () => {
    const { headers, purchase } = await purchaseOfTwoLines();

    const response = await removeLine(headers, purchase, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "line_not_found" });
  });

  it("answers 404 for a purchase of another branch, changing nothing", async () => {
    const { purchase } = await purchaseOfTwoLines();
    const otherBranch = await signedInWith(db, ["record_purchases"], NOW, {
      locationId: await insertLocation(db),
    });

    const response = await removeLine(otherBranch.headers, purchase);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "purchase_not_found" });
    expect((await db.select().from(purchaseLines))[0]?.removedAt).toBeNull();
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
          product: purchase.lines[0]?.product,
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
