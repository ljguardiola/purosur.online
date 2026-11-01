import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleOrderSuggestionReader } from "./drizzle-order-suggestion-reader.js";
import {
  completeSale,
  insertRegisterDeviceIn,
  setCoverageDays,
  setStock,
} from "./test-support/order-suggestion-fixtures.js";
import { insertProduct } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const RANGE = { from: "2026-08-18", to: "2026-09-16" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let locationId: string;

const reader = () => new DrizzleOrderSuggestionReader(db);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
});

describe("the coverage days", () => {
  it("answers those of each active product, 15 when never configured", async () => {
    const configured = await insertProduct(db, { name: "Yerba" });
    const standard = await insertProduct(db, { name: "Harina" });
    await insertProduct(db, { name: "Retirado", active: false });
    await setCoverageDays(db, configured.id, 40);

    const coverage = await reader().coverageDays();

    expect(coverage).toHaveLength(2);
    expect(coverage).toEqual(
      expect.arrayContaining([
        { productId: configured.id, coverageDays: 40 },
        { productId: standard.id, coverageDays: 15 },
      ]),
    );
  });
});

describe("the current stock", () => {
  it("answers the balance of each product in the branch, in thousandths", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    await setStock(db, { productId: yerba.id, locationId, quantity: 12_000 });
    await setStock(db, { productId: harina.id, locationId, quantity: 3_500 });

    const stock = await reader().currentStock(locationId);

    expect(stock).toHaveLength(2);
    expect(stock).toEqual(
      expect.arrayContaining([
        { productId: yerba.id, quantity: 12_000 },
        { productId: harina.id, quantity: 3_500 },
      ]),
    );
  });

  it("leaves out what other branches hold", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const otherBranch = await insertLocation(db);
    await setStock(db, { productId: yerba.id, locationId: otherBranch, quantity: 99_000 });
    await setStock(db, { productId: yerba.id, locationId, quantity: 1_000 });

    expect(await reader().currentStock(locationId)).toEqual([
      { productId: yerba.id, quantity: 1_000 },
    ]);
  });
});

describe("the completed sales by product", () => {
  it("answers the branch's sales of the period like the sales reports do", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const queso = await insertProduct(db, { name: "Queso", saleUnit: "KG" });
    const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
    const inRange = new Date("2026-09-10T15:00:00.000Z");
    await completeSale(db, { deviceId, productId: yerba.id, quantity: 4, completedAt: inRange });
    await completeSale(db, { deviceId, productId: yerba.id, quantity: 6, completedAt: inRange });
    await completeSale(db, {
      deviceId,
      productId: queso.id,
      quantity: 1_500,
      weightSource: "SCALE",
      completedAt: inRange,
    });

    const sold = await reader().completedSalesByProduct({ locationId, range: RANGE });

    expect(sold).toHaveLength(2);
    expect(sold).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: yerba.id, quantity: 10, weightSource: null }),
        expect.objectContaining({ id: queso.id, quantity: 1_500, weightSource: "SCALE" }),
      ]),
    );
  });

  it("leaves out the days outside the period, counted in Argentina", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
    const before = new Date("2026-08-18T02:59:00.000Z");
    const first = new Date("2026-08-18T03:00:00.000Z");
    await completeSale(db, { deviceId, productId: yerba.id, quantity: 100, completedAt: before });
    await completeSale(db, { deviceId, productId: yerba.id, quantity: 7, completedAt: first });

    const sold = await reader().completedSalesByProduct({ locationId, range: RANGE });

    expect(sold.map((row) => row.quantity)).toEqual([7]);
  });

  it("leaves out the sales of other branches", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const otherBranch = await insertLocation(db);
    const otherDevice = await insertRegisterDeviceIn(db, otherBranch, NOW);
    const ownDevice = await insertRegisterDeviceIn(db, locationId, NOW);
    const moment = new Date("2026-09-10T15:00:00.000Z");
    await completeSale(db, {
      deviceId: otherDevice,
      productId: yerba.id,
      quantity: 50,
      completedAt: moment,
    });
    await completeSale(db, {
      deviceId: ownDevice,
      productId: yerba.id,
      quantity: 2,
      completedAt: moment,
    });

    const sold = await reader().completedSalesByProduct({ locationId, range: RANGE });

    expect(sold.map((row) => row.quantity)).toEqual([2]);
  });
});
