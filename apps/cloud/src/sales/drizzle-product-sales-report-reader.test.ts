import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleProductSalesReportReader } from "./drizzle-product-sales-report-reader.js";
import { applyCancelledSale, applyCompletedSale } from "./test-support/applied-sales.js";
import { aSoldLine, insertCategoryNamed, insertProductIn } from "./test-support/sold-lines.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const MOMENT = new Date("2026-10-06T14:00:00.000Z");
const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const reader = () => new DrizzleProductSalesReportReader(db);

type Line = ReturnType<typeof aSoldLine>;

async function sold(deviceId: string, lines: Line[], completedAt = MOMENT) {
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return applyCompletedSale(db, { deviceId, completedAt, total, overrides: { lines } });
}

async function aRegister(name = "Caja 1", locationId?: string) {
  if (locationId === undefined) {
    return insertEnrolledInstallation(db, { now: NOW, registerName: name });
  }
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return insertEnrolledInstallation(db, { now: NOW, existingRegisterId: register.id });
}

function byFirstPathName<T extends { path: readonly string[] }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.path.join() < b.path.join() ? -1 : 1));
}

describe("DrizzleProductSalesReportReader.completedSalesByProduct", () => {
  it("adds up the quantity and the amount of the lines of each product", async () => {
    const { deviceId, locationId } = await aRegister();
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const sugar = await insertProductIn(db, categoryId, "Azúcar 1 kg");
    const oil = await insertProductIn(db, categoryId, "Aceite 900 ml");
    await sold(deviceId, [
      aSoldLine(sugar, "Azúcar 1 kg", 2, 4_800),
      aSoldLine(oil, "Aceite", 1, 3_000),
    ]);
    await sold(deviceId, [aSoldLine(sugar, "Azúcar 1 kg", 3, 7_200)]);

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(byFirstPathName(rows)).toEqual([
      { id: oil, path: ["Aceite 900 ml"], weightSource: null, quantity: 1, amount: 3_000 },
      { id: sugar, path: ["Azúcar 1 kg"], weightSource: null, quantity: 5, amount: 12_000 },
    ]);
  });

  it("keeps the lines sold by unit and by weight of one product in separate rows", async () => {
    const { deviceId, locationId } = await aRegister();
    const categoryId = await insertCategoryNamed(db, "Fiambres");
    const cheese = await insertProductIn(db, categoryId, "Queso");
    await sold(deviceId, [
      aSoldLine(cheese, "Queso", 2, 2_000),
      aSoldLine(cheese, "Queso", 1_250, 9_000, "SCALE"),
      aSoldLine(cheese, "Queso", 300, 1_800, "MANUAL"),
      aSoldLine(cheese, "Queso", 250, 1_500, "SCALE"),
    ]);

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: cheese, path: ["Queso"], weightSource: null, quantity: 2, amount: 2_000 },
        { id: cheese, path: ["Queso"], weightSource: "SCALE", quantity: 1_500, amount: 10_500 },
        { id: cheese, path: ["Queso"], weightSource: "MANUAL", quantity: 300, amount: 1_800 },
      ]),
    );
  });

  it("names a product by its current name, not the one it had when it was sold", async () => {
    const { deviceId, locationId } = await aRegister();
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, categoryId, "Yerba");
    await sold(deviceId, [aSoldLine(product, "Yerba vieja", 1, 3_000)]);
    await db.update(products).set({ name: "Yerba mate 1 kg" }).where(eq(products.id, product));

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows.map((row) => row.path)).toEqual([["Yerba mate 1 kg"]]);
  });

  it("names a product that is not in the catalog by the name its sale lines carry", async () => {
    const { deviceId, locationId } = await aRegister();
    const unknown = randomUUID();
    await sold(deviceId, [aSoldLine(unknown, "Producto retirado", 1, 500)]);

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([
      { id: unknown, path: ["Producto retirado"], weightSource: null, quantity: 1, amount: 500 },
    ]);
  });

  it("leaves out the lines of a cancelled sale", async () => {
    const { deviceId, locationId } = await aRegister();
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, categoryId, "Sal");
    await sold(deviceId, [aSoldLine(product, "Sal", 1, 800)]);
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 9_000,
      overrides: { lines: [aSoldLine(product, "Sal", 9, 9_000)] },
    });

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([
      { id: product, path: ["Sal"], weightSource: null, quantity: 1, amount: 800 },
    ]);
  });

  it("dates a line by the Argentina calendar day its sale was completed", async () => {
    const { deviceId, locationId } = await aRegister();
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, categoryId, "Sal");
    const at = (completedAt: string) => new Date(completedAt);
    await sold(deviceId, [aSoldLine(product, "Sal", 1, 1)], at("2026-10-05T02:59:00.000Z"));
    await sold(deviceId, [aSoldLine(product, "Sal", 1, 20)], at("2026-10-05T03:00:00.000Z"));
    await sold(deviceId, [aSoldLine(product, "Sal", 1, 300)], at("2026-10-07T02:59:00.000Z"));
    await sold(deviceId, [aSoldLine(product, "Sal", 1, 4_000)], at("2026-10-07T03:00:00.000Z"));

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(rows).toEqual([
      { id: product, path: ["Sal"], weightSource: null, quantity: 2, amount: 320 },
    ]);
  });

  it("limits the report to the sales of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, categoryId, "Sal");
    await sold(first.deviceId, [aSoldLine(product, "Sal", 1, 1_000)]);
    await sold(second.deviceId, [aSoldLine(product, "Sal", 4, 250)]);

    const rows = await reader().completedSalesByProduct({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(rows).toEqual([
      { id: product, path: ["Sal"], weightSource: null, quantity: 4, amount: 250 },
    ]);
  });

  it("never shows the lines of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, categoryId, "Sal");
    await sold(own.deviceId, [aSoldLine(product, "Sal", 1, 1_000)]);
    await sold(other.deviceId, [aSoldLine(product, "Sal", 7, 7_000)]);

    const ofTheBranch = await reader().completedSalesByProduct({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedSalesByProduct({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch).toEqual([
      { id: product, path: ["Sal"], weightSource: null, quantity: 1, amount: 1_000 },
    ]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without sales", async () => {
    const { locationId } = await aRegister();

    const rows = await reader().completedSalesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([]);
  });
});

describe("DrizzleProductSalesReportReader.completedSalesByCategory", () => {
  it("groups the lines under the category of their product, with the path from the root", async () => {
    const { deviceId, locationId } = await aRegister();
    const grocery = await insertCategoryNamed(db, "Almacén");
    const sweets = await insertCategoryNamed(db, "Dulces", grocery);
    const jams = await insertCategoryNamed(db, "Mermeladas", sweets);
    const jam = await insertProductIn(db, jams, "Mermelada de durazno");
    const honey = await insertProductIn(db, sweets, "Miel");
    const rice = await insertProductIn(db, grocery, "Arroz");
    await sold(deviceId, [
      aSoldLine(jam, "Mermelada de durazno", 2, 4_000),
      aSoldLine(honey, "Miel", 1, 5_000),
      aSoldLine(rice, "Arroz", 3, 3_000),
    ]);

    const rows = await reader().completedSalesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(byFirstPathName(rows)).toEqual([
      { id: grocery, path: ["Almacén"], weightSource: null, quantity: 3, amount: 3_000 },
      { id: sweets, path: ["Almacén", "Dulces"], weightSource: null, quantity: 1, amount: 5_000 },
      {
        id: jams,
        path: ["Almacén", "Dulces", "Mermeladas"],
        weightSource: null,
        quantity: 2,
        amount: 4_000,
      },
    ]);
  });

  it("adds up the products of one category and keeps its weighed lines in their own row", async () => {
    const { deviceId, locationId } = await aRegister();
    const category = await insertCategoryNamed(db, "Fiambres");
    const cheese = await insertProductIn(db, category, "Queso");
    const ham = await insertProductIn(db, category, "Jamón");
    await sold(deviceId, [
      aSoldLine(cheese, "Queso", 1_000, 8_000, "SCALE"),
      aSoldLine(ham, "Jamón", 500, 5_000, "MANUAL"),
      aSoldLine(ham, "Jamón", 2, 2_000),
    ]);

    const rows = await reader().completedSalesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: category, path: ["Fiambres"], weightSource: "SCALE", quantity: 1_000, amount: 8_000 },
        { id: category, path: ["Fiambres"], weightSource: "MANUAL", quantity: 500, amount: 5_000 },
        { id: category, path: ["Fiambres"], weightSource: null, quantity: 2, amount: 2_000 },
      ]),
    );
  });

  it("counts the past sales of a product that moved under the category it is in now", async () => {
    const { deviceId, locationId } = await aRegister();
    const before = await insertCategoryNamed(db, "Almacén");
    const now = await insertCategoryNamed(db, "Limpieza");
    const product = await insertProductIn(db, before, "Lavandina");
    await sold(deviceId, [aSoldLine(product, "Lavandina", 2, 1_600)]);
    await db.update(products).set({ categoryId: now }).where(eq(products.id, product));

    const rows = await reader().completedSalesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([
      { id: now, path: ["Limpieza"], weightSource: null, quantity: 2, amount: 1_600 },
    ]);
  });

  it("puts the lines of a product that is not in the catalog in one row without a category", async () => {
    const { deviceId, locationId } = await aRegister();
    await sold(deviceId, [
      aSoldLine(randomUUID(), "Retirado", 1, 500),
      aSoldLine(randomUUID(), "Otro retirado", 2, 700),
    ]);

    const rows = await reader().completedSalesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([{ id: null, path: [], weightSource: null, quantity: 3, amount: 1_200 }]);
  });

  it("leaves out cancelled sales, other branches, other registers and other days", async () => {
    const own = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const otherLocation = await insertLocation(db);
    const elsewhere = await aRegister("Caja 9", otherLocation);
    const category = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, category, "Sal");
    await sold(own.deviceId, [aSoldLine(product, "Sal", 1, 100)]);
    await sold(second.deviceId, [aSoldLine(product, "Sal", 1, 20_000)]);
    await sold(elsewhere.deviceId, [aSoldLine(product, "Sal", 1, 3_000_000)]);
    await sold(
      own.deviceId,
      [aSoldLine(product, "Sal", 1, 400_000)],
      new Date("2026-09-30T14:00:00.000Z"),
    );
    await applyCancelledSale(db, {
      deviceId: own.deviceId,
      cancelledAt: MOMENT,
      total: 5_000_000,
      overrides: { lines: [aSoldLine(product, "Sal", 1, 5_000_000)] },
    });

    const ofTheBranch = await reader().completedSalesByCategory({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofTheSecondRegister = await reader().completedSalesByCategory({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(ofTheBranch.map((row) => row.amount)).toEqual([20_100]);
    expect(ofTheSecondRegister.map((row) => row.amount)).toEqual([20_000]);
  });

  it("reports nothing for a range without sales", async () => {
    const { locationId } = await aRegister();

    const rows = await reader().completedSalesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([]);
  });
});
