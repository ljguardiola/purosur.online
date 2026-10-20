import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertTag } from "../catalog/test-support/catalog-route-fixtures.js";
import { registers } from "../platform/db/schema.js";
import { insertDiscount } from "../pricing/test-support/discount-route-fixtures.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePromotionSalesReportReader } from "./drizzle-promotion-sales-report-reader.js";
import { applyCancelledSale, applyCompletedSale } from "./test-support/applied-sales.js";
import {
  aSoldLine,
  insertCategoryNamed,
  insertProductIn,
  withPromotion,
} from "./test-support/sold-lines.js";

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

const reader = () => new DrizzlePromotionSalesReportReader(db);

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

async function aProduct(name = "Yerba 1 kg") {
  const categoryId = await insertCategoryNamed(db, "Almacén");
  return { categoryId, productId: await insertProductIn(db, categoryId, name) };
}

async function sell(deviceId: string, lines: ReturnType<typeof aSoldLine>[], completedAt = MOMENT) {
  return applyCompletedSale(db, {
    deviceId,
    completedAt,
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    overrides: { lines },
  });
}

const byPromotion = <T extends { promotionId: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.promotionId < b.promotionId ? -1 : 1));

describe("DrizzlePromotionSalesReportReader.completedSalesByPromotion", () => {
  it("counts the lines, quantity and discount of each promotion with its current terms", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId, categoryId } = await aProduct();
    const percent = await insertDiscount(db, {
      now: NOW,
      name: "Finde de almacén",
      categoryId,
      percent: 15,
      weekdays: [6, 7],
    });
    const bundle = await insertDiscount(db, {
      now: NOW,
      name: "Tres por dos",
      productId,
      kind: "BUY_N_PAY_M",
      percent: null,
      buyQty: 3,
      payQty: 2,
    });
    await sell(deviceId, [
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 2, 3_000), percent.id, 500),
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 3, 4_000), percent.id, 700),
    ]);
    await sell(deviceId, [
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 3, 900), bundle.id, 300),
    ]);

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(byPromotion(rows)).toEqual(
      byPromotion([
        {
          promotionId: percent.id,
          name: "Finde de almacén",
          terms: {
            benefit: { kind: "PERCENT_OFF", percent: 15 },
            target: { kind: "CATEGORY", name: "Almacén" },
            weekdays: [6, 7],
          },
          weightSource: null,
          quantity: 5,
          lines: 2,
          discounted: 1_200,
        },
        {
          promotionId: bundle.id,
          name: "Tres por dos",
          terms: {
            benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
            target: { kind: "PRODUCT", name: "Yerba 1 kg" },
            weekdays: [],
          },
          weightSource: null,
          quantity: 3,
          lines: 1,
          discounted: 300,
        },
      ]),
    );
  });

  it("names a tag target by the tag", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId } = await aProduct();
    const tag = await insertTag(db, { name: "Sin TACC" });
    const discount = await insertDiscount(db, { now: NOW, tagId: tag.id });
    await sell(deviceId, [
      withPromotion(aSoldLine(productId, "Galletas", 1, 900), discount.id, 100),
    ]);

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows[0]?.terms?.target).toEqual({ kind: "TAG", name: "Sin TACC" });
  });

  it("keeps the lines sold by weight apart from the lines sold by unit", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId } = await aProduct();
    const discount = await insertDiscount(db, { now: NOW, productId });
    await sell(deviceId, [
      withPromotion(aSoldLine(productId, "Queso", 1_250, 5_000, "SCALE"), discount.id, 400),
      withPromotion(aSoldLine(productId, "Queso", 2, 3_000), discount.id, 100),
    ]);

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(
      [...rows]
        .sort((a, b) => b.quantity - a.quantity)
        .map(({ weightSource, quantity, lines, discounted }) => ({
          weightSource,
          quantity,
          lines,
          discounted,
        })),
    ).toEqual([
      { weightSource: "SCALE", quantity: 1_250, lines: 1, discounted: 400 },
      { weightSource: null, quantity: 2, lines: 1, discounted: 100 },
    ]);
  });

  it("leaves out the lines without a promotion", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId } = await aProduct();
    const discount = await insertDiscount(db, { now: NOW, productId });
    await sell(deviceId, [
      aSoldLine(productId, "Yerba 1 kg", 4, 8_000),
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 1, 900), discount.id, 100),
    ]);

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows.map(({ lines, discounted }) => ({ lines, discounted }))).toEqual([
      { lines: 1, discounted: 100 },
    ]);
  });

  it("reports a promotion whose discount no longer exists without a name or terms", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId } = await aProduct();
    const missing = randomUUID();
    await sell(deviceId, [
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 2, 1_800), missing, 200),
    ]);

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([
      {
        promotionId: missing,
        name: null,
        terms: null,
        weightSource: null,
        quantity: 2,
        lines: 1,
        discounted: 200,
      },
    ]);
  });

  it("leaves out cancelled sales", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId } = await aProduct();
    const discount = await insertDiscount(db, { now: NOW, productId });
    await sell(deviceId, [
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 1, 900), discount.id, 100),
    ]);
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 900,
      overrides: {
        lines: [withPromotion(aSoldLine(productId, "Yerba 1 kg", 5, 9_000), discount.id, 999)],
      },
    });

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows.map(({ lines, discounted }) => ({ lines, discounted }))).toEqual([
      { lines: 1, discounted: 100 },
    ]);
  });

  it("dates a sale by the Argentina calendar day it was completed", async () => {
    const { deviceId, locationId } = await aRegister();
    const { productId } = await aProduct();
    const discount = await insertDiscount(db, { now: NOW, productId });
    const at = (completedAt: string, discounted: number) =>
      sell(
        deviceId,
        [withPromotion(aSoldLine(productId, "Yerba 1 kg", 1, 900), discount.id, discounted)],
        new Date(completedAt),
      );
    await at("2026-10-05T02:59:00.000Z", 1);
    await at("2026-10-05T03:00:00.000Z", 20);
    await at("2026-10-07T02:59:00.000Z", 300);
    await at("2026-10-07T03:00:00.000Z", 4_000);

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(rows.map(({ lines, discounted }) => ({ lines, discounted }))).toEqual([
      { lines: 2, discounted: 320 },
    ]);
  });

  it("limits the report to the sales of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const { productId } = await aProduct();
    const discount = await insertDiscount(db, { now: NOW, productId });
    const line = (discounted: number) =>
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 1, 900), discount.id, discounted);
    await sell(first.deviceId, [line(100)]);
    await sell(second.deviceId, [line(25)]);

    const rows = await reader().completedSalesByPromotion({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(rows.map((row) => row.discounted)).toEqual([25]);
  });

  it("never shows the sales of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const { productId } = await aProduct();
    const discount = await insertDiscount(db, { now: NOW, productId });
    const line = (discounted: number) =>
      withPromotion(aSoldLine(productId, "Yerba 1 kg", 1, 900), discount.id, discounted);
    await sell(own.deviceId, [line(100)]);
    await sell(other.deviceId, [line(700)]);

    const ofTheBranch = await reader().completedSalesByPromotion({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedSalesByPromotion({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch.map((row) => row.discounted)).toEqual([100]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without discounted lines", async () => {
    const { locationId } = await aRegister();

    const rows = await reader().completedSalesByPromotion({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([]);
  });
});
