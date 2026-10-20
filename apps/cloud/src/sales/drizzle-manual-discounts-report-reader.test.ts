import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleManualDiscountsReportReader } from "./drizzle-manual-discounts-report-reader.js";
import {
  applyCancelledSale,
  applyCompletedSale,
  applyVoidedSale,
} from "./test-support/applied-sales.js";
import { aSoldLine, withManualAdjustment } from "./test-support/sold-lines.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const MOMENT = new Date("2026-10-06T14:00:00.000Z");
const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };
const productId = randomUUID();

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

const reader = () => new DrizzleManualDiscountsReportReader(db);

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

async function aUser(firstName: string, locationId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({ id, firstName, email: `${id}@example.com`, locationId });
  return id;
}

const percentOnTotal = (percent: number, authorizedBy: string | null = null) => ({
  kind: "PERCENT" as const,
  percent,
  reason: "Cliente frecuente",
  authorizedBy,
});

function lineWith(
  adjustment: Parameters<typeof withManualAdjustment>[1],
  quantity = 2,
  unitPrice = 1_000,
) {
  return withManualAdjustment(
    {
      ...aSoldLine(productId, "Yerba 1 kg", quantity, quantity * unitPrice),
      listUnitPrice: unitPrice,
    },
    adjustment,
  );
}

async function sell(
  deviceId: string,
  actorId: string,
  overrides: Parameters<typeof applyCompletedSale>[1]["overrides"],
  completedAt = MOMENT,
) {
  return applyCompletedSale(db, {
    deviceId,
    completedAt,
    total: 1_000,
    overrides: { actorId, ...overrides },
  });
}

describe("DrizzleManualDiscountsReportReader.completedManualDiscounts", () => {
  it("reads a discount on the total with its cashier, authorizer and the sale it belongs to", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    const boss = await aUser("Beto", locationId);
    const saleId = await sell(deviceId, cashier, {
      operationNumber: 12,
      saleDiscount: percentOnTotal(10, boss),
      saleDiscountAmount: 500,
    });

    const records = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(records).toEqual({
      saleDiscounts: [
        {
          saleId,
          operationNumber: 12,
          completedAt: MOMENT,
          actorId: cashier,
          actorName: "Ana",
          authorizedBy: boss,
          authorizedByName: "Beto",
          reason: "Cliente frecuente",
          discount: { kind: "PERCENT", percent: 10 },
          amount: 500,
        },
      ],
      lineDiscounts: [],
    });
  });

  it("reads an amount discount on the total and leaves the authorizer empty when the cashier had the permission", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    await sell(deviceId, cashier, {
      saleDiscount: { kind: "AMOUNT", amount: 700, reason: "Promoción verbal", authorizedBy: null },
      saleDiscountAmount: 700,
    });

    const { saleDiscounts } = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(saleDiscounts).toMatchObject([
      {
        operationNumber: null,
        actorId: cashier,
        actorName: "Ana",
        authorizedBy: null,
        authorizedByName: null,
        reason: "Promoción verbal",
        discount: { kind: "AMOUNT", amount: 700 },
        amount: 700,
      },
    ]);
  });

  it("reads the manual adjustment of each line with what is needed to price it", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    const boss = await aUser("Beto", locationId);
    const percent = lineWith({
      kind: "PERCENT",
      percent: 10,
      reason: "Envase dañado",
      authorizedBy: boss,
    });
    const price = lineWith({
      kind: "PRICE",
      unitPrice: 800,
      reason: "Vencimiento",
      authorizedBy: null,
    });
    const amount = lineWith({ kind: "AMOUNT", amount: 350, reason: "Regateo", authorizedBy: null });
    const weighed = {
      ...lineWith(
        { kind: "PERCENT", percent: 50, reason: "Punta", authorizedBy: null },
        1_500,
        2_000,
      ),
      weightSource: "SCALE" as const,
    };
    const plain = aSoldLine(productId, "Azúcar", 1, 900);
    const saleId = await sell(deviceId, cashier, {
      operationNumber: 3,
      lines: [percent, price, amount, weighed, plain],
    });

    const { lineDiscounts, saleDiscounts } = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    const byLine = (lineId: string) => lineDiscounts.find((record) => record.lineId === lineId);
    expect(saleDiscounts).toEqual([]);
    expect(lineDiscounts).toHaveLength(4);
    expect(byLine(percent.id)).toEqual({
      saleId,
      operationNumber: 3,
      completedAt: MOMENT,
      actorId: cashier,
      actorName: "Ana",
      authorizedBy: boss,
      authorizedByName: "Beto",
      reason: "Envase dañado",
      lineId: percent.id,
      productName: "Yerba 1 kg",
      quantity: 2,
      weightSource: null,
      listUnitPrice: 1_000,
      adjustment: { kind: "PERCENT", percent: 10 },
    });
    expect(byLine(price.id)?.adjustment).toEqual({ kind: "PRICE", unitPrice: 800 });
    expect(byLine(amount.id)?.adjustment).toEqual({ kind: "AMOUNT", amount: 350 });
    expect(byLine(weighed.id)).toMatchObject({
      weightSource: "SCALE",
      quantity: 1_500,
      listUnitPrice: 2_000,
    });
    expect(byLine(plain.id)).toBeUndefined();
  });

  it("names an authorizer or cashier that no longer exists as unknown", async () => {
    const { deviceId, locationId } = await aRegister();
    const gone = randomUUID();
    await sell(deviceId, gone, {
      saleDiscount: percentOnTotal(10, randomUUID()),
      saleDiscountAmount: 100,
    });

    const { saleDiscounts } = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(saleDiscounts).toMatchObject([
      { actorId: gone, actorName: null, authorizedByName: null },
    ]);
  });

  it("includes a sale right after it is applied", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    const saleId = await sell(deviceId, cashier, {
      saleDiscount: percentOnTotal(10),
      saleDiscountAmount: 100,
    });

    const { saleDiscounts } = await reader().completedManualDiscounts({
      locationId,
      range: { from: "2026-10-06", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(saleDiscounts.map((record) => record.saleId)).toEqual([saleId]);
  });

  it("leaves out sales without any discount", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    await sell(deviceId, cashier, { lines: [aSoldLine(productId, "Yerba 1 kg", 1, 900)] });

    const records = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(records).toEqual({ saleDiscounts: [], lineDiscounts: [] });
  });

  it("leaves out the discounts of cancelled and voided sales", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    const discounted = {
      actorId: cashier,
      saleDiscount: percentOnTotal(10),
      saleDiscountAmount: 100,
      lines: [
        lineWith({ kind: "PERCENT", percent: 10, reason: "Envase dañado", authorizedBy: null }),
      ],
    };
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 900,
      overrides: { lines: discounted.lines },
    });
    await applyVoidedSale(db, {
      deviceId,
      completedAt: MOMENT,
      voidedAt: new Date("2026-10-06T15:00:00.000Z"),
      completed: discounted,
    });

    const records = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(records).toEqual({ saleDiscounts: [], lineDiscounts: [] });
  });

  it("dates a sale by the Argentina calendar day it was completed", async () => {
    const { deviceId, locationId } = await aRegister();
    const cashier = await aUser("Ana", locationId);
    const at = (completedAt: string, amount: number) =>
      sell(
        deviceId,
        cashier,
        { saleDiscount: percentOnTotal(10), saleDiscountAmount: amount },
        new Date(completedAt),
      );
    await at("2026-10-05T02:59:00.000Z", 1);
    await at("2026-10-05T03:00:00.000Z", 20);
    await at("2026-10-07T02:59:00.000Z", 300);
    await at("2026-10-07T03:00:00.000Z", 4_000);

    const { saleDiscounts } = await reader().completedManualDiscounts({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(saleDiscounts.map((record) => record.amount).sort((a, b) => a - b)).toEqual([20, 300]);
  });

  it("limits the report to the sales of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const cashier = await aUser("Ana", first.locationId);
    const discounted = (amount: number) => ({
      saleDiscount: percentOnTotal(10),
      saleDiscountAmount: amount,
    });
    await sell(first.deviceId, cashier, discounted(100));
    await sell(second.deviceId, cashier, discounted(25));

    const { saleDiscounts } = await reader().completedManualDiscounts({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(saleDiscounts.map((record) => record.amount)).toEqual([25]);
  });

  it("never shows the sales of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const cashier = await aUser("Ana", own.locationId);
    const overrides = (amount: number) => ({
      saleDiscount: percentOnTotal(10),
      saleDiscountAmount: amount,
      lines: [
        lineWith({ kind: "PERCENT", percent: 10, reason: "Envase dañado", authorizedBy: null }),
      ],
    });
    await sell(own.deviceId, cashier, overrides(100));
    await sell(other.deviceId, cashier, overrides(700));

    const ofTheBranch = await reader().completedManualDiscounts({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedManualDiscounts({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch.saleDiscounts.map((record) => record.amount)).toEqual([100]);
    expect(ofTheBranch.lineDiscounts).toHaveLength(1);
    expect(ofAnotherBranchsRegister).toEqual({ saleDiscounts: [], lineDiscounts: [] });
  });

  it("reports nothing for a range without discounts", async () => {
    const { locationId } = await aRegister();

    const records = await reader().completedManualDiscounts({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(records).toEqual({ saleDiscounts: [], lineDiscounts: [] });
  });
});
