import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { aSoldLine } from "../sales/test-support/sold-lines.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { registerMarginReportRoute } from "./margin-report-route.js";
import { insertInitialCountLot, insertPurchasedLot } from "./test-support/lot-fixtures.js";
import { insertSaleMovement } from "./test-support/sale-lot-fixtures.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-10-12T15:00:00.000Z");
const SOLD = new Date("2026-10-06T14:00:00.000Z");

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
  registerMarginReportRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    zoneRules: fixedZoneRulesSource(),
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function marginReport(headers: Record<string, string>, query = "?group=product") {
  return app.inject({ method: "GET", url: `/reports/margin${query}`, headers });
}

describe("GET /reports/margin access", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await marginReport({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await marginReport({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["manage_expiration_dates", "view_stock_balances"] as const)(
    "rejects a user holding %s but not view_reports",
    async (permission) => {
      const { headers } = await signedInWith(db, [permission], NOW);

      const response = await marginReport(headers);

      expect(response.statusCode).toBe(403);
    },
  );

  it("answers a user who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await marginReport(headers);

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["no group", ""],
    ["a group that is not offered", "?group=brand"],
    ["half a period", "?group=product&from=2026-10-01"],
    ["a parameter given twice", "?group=product&from=2026-10-01&from=2026-10-02&to=2026-10-31"],
    ["a register that is not an id", "?group=product&register_id=caja-1"],
  ])("answers 400 to %s", async (_name, query) => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await marginReport(headers, query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("GET /reports/margin", () => {
  const range = "from=2026-10-06&to=2026-10-06";

  async function sellFrom(
    locationId: string,
    productId: string,
    actorId: string,
    registerName: string,
    quantity: number,
    existingRegisterId?: string,
  ) {
    const { deviceId, registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      ...(existingRegisterId === undefined ? { registerName } : { existingRegisterId }),
    });
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId });
    const line = aSoldLine(productId, "Azúcar 1 kg", quantity, quantity * 10_000);
    await applyCompletedSale(db, {
      deviceId,
      completedAt: SOLD,
      total: line.lineTotal,
      overrides: { lines: [line] },
    });
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId,
      saleLineId: line.id,
      allocations: [{ lotId, quantity: -quantity * 1_000 }],
    });
    return registerId;
  }

  it("answers today's Argentine day with no rows when nothing was sold", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await marginReport(headers);

    expect(response.json()).toEqual({
      range: { from: "2026-10-12", to: "2026-10-12" },
      group: "product",
      rows: [],
      totals: { amount: 0, cost: 0, margin: 0, incompleteSales: 0 },
    });
  });

  it("answers the margin of the session's branch by product, as the wire describes it", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      brandName: "Vitora",
      netContent: { quantity: 250, unit: "G" },
    });
    await sellFrom(locationId, productId, userId, "Caja 1", 2);
    const elsewhere = await insertLocation(db);
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: elsewhere, name: "Caja 9" })
      .returning({ id: registers.id });
    await sellFrom(elsewhere, productId, userId, "Caja 9", 7, otherRegister?.id);

    const response = await marginReport(headers, `?group=product&${range}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      range: { from: "2026-10-06", to: "2026-10-06" },
      group: "product",
      rows: [
        {
          id: productId,
          path: ["Almendras peladas"],
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          amount: 20_000,
          cost: 10_000,
          margin: 10_000,
          incompleteSales: 0,
        },
      ],
      totals: { amount: 20_000, cost: 10_000, margin: 10_000, incompleteSales: 0 },
    });
  });

  it("answers the margin by category with the category's path and flags a sale of an unknown cost", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId, categoryId } = await insertProduct(db, { categoryName: "Almacén" });
    const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const { lotId } = await insertInitialCountLot(db, { productId, locationId, actorId: userId });
    const line = aSoldLine(productId, "Miel", 1, 10_000);
    await applyCompletedSale(db, {
      deviceId,
      completedAt: SOLD,
      total: 10_000,
      overrides: { lines: [line] },
    });
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId: userId,
      saleLineId: line.id,
      allocations: [{ lotId, quantity: -1_000 }],
    });

    const response = await marginReport(headers, `?group=category&${range}`);

    expect(response.json()).toEqual({
      range: { from: "2026-10-06", to: "2026-10-06" },
      group: "category",
      rows: [
        {
          id: categoryId,
          path: ["Almacén"],
          brandName: null,
          netContent: null,
          amount: 10_000,
          cost: 0,
          margin: 10_000,
          incompleteSales: 1,
        },
      ],
      totals: { amount: 10_000, cost: 0, margin: 10_000, incompleteSales: 1 },
    });
  });

  it("limits the report to the asked register", async () => {
    const { headers, locationId, userId } = await signedInWith(db, ["view_reports"], NOW);
    const { productId } = await insertProduct(db);
    await sellFrom(locationId, productId, userId, "Caja 1", 1);
    const second = await sellFrom(locationId, productId, userId, "Caja 2", 3);

    const response = await marginReport(headers, `?group=product&${range}&register_id=${second}`);

    expect(response.json().totals).toEqual({
      amount: 30_000,
      cost: 15_000,
      margin: 15_000,
      incompleteSales: 0,
    });
  });
});
