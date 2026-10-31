import { randomUUID } from "node:crypto";
import type { MarginAllocation } from "@purosur/domain";
import { readMarginReport } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { products, registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyReturn } from "../returns/test-support/applied-returns.js";
import {
  applyCancelledSale,
  applyCompletedSale,
  applyVoidedSale,
} from "../sales/test-support/applied-sales.js";
import {
  aSoldLine,
  insertCategoryNamed,
  insertProductIn,
} from "../sales/test-support/sold-lines.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { DrizzleSaleMarginReportReader } from "./drizzle-sale-margin-report-reader.js";
import {
  insertInitialCountLot,
  insertPurchasedLot,
  insertTechnicalLot,
} from "./test-support/lot-fixtures.js";
import { insertSaleMovement } from "./test-support/sale-lot-fixtures.js";
import { insertLocation } from "./test-support/stock-route-fixtures.js";

const NOW = new Date("2026-11-20T15:00:00.000Z");
const SOLD = new Date("2026-10-06T14:00:00.000Z");
const RETURNED_LATER = new Date("2026-11-10T14:00:00.000Z");
const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };
const FIVE_PER_UNIT = { totalCents: 5_000, quantity: 1_000 };

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

const reader = () => new DrizzleSaleMarginReportReader(db);

type Line = ReturnType<typeof aSoldLine>;

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

async function aCashier(locationId: string): Promise<string> {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, firstName: "Ana", email: `ana-${id}@example.com`, locationId });
  return id;
}

async function sold(deviceId: string, lines: Line[], completedAt = SOLD) {
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return applyCompletedSale(db, { deviceId, completedAt, total, overrides: { lines } });
}

function saleAllocation(
  lotId: string,
  quantity: number,
  overrides: Partial<MarginAllocation> = {},
): MarginAllocation {
  return {
    lotId,
    movementKind: "sale",
    quantity,
    technical: false,
    costIncomplete: false,
    cost: FIVE_PER_UNIT,
    ...overrides,
  };
}

function ordered<T extends { allocations: readonly MarginAllocation[] }>(lines: T[]): T[] {
  return lines.map((line) => ({
    ...line,
    allocations: [...line.allocations].sort(
      (a, b) => b.movementKind.localeCompare(a.movementKind) || a.lotId.localeCompare(b.lotId),
    ),
  }));
}

async function soldOneProduct() {
  const own = await aRegister();
  const cashierId = await aCashier(own.locationId);
  const categoryId = await insertCategoryNamed(db, "Almacén");
  const productId = await insertProductIn(db, categoryId, "Azúcar 1 kg");
  return { ...own, cashierId, categoryId, productId };
}

describe("DrizzleSaleMarginReportReader.completedSaleLinesByProduct", () => {
  it("answers each sold line with its amount and the lots its sale took from, with their cost", async () => {
    const { deviceId, locationId, cashierId, productId } = await soldOneProduct();
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId: cashierId });
    const line = aSoldLine(productId, "Azúcar 1 kg", 2, 20_000);
    const saleId = await sold(deviceId, [line]);
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId: cashierId,
      saleLineId: line.id,
      allocations: [{ lotId, quantity: -2_000 }],
    });

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines).toEqual([
      {
        saleId,
        id: productId,
        path: ["Azúcar 1 kg"],
        brandName: null,
        netContent: null,
        amount: 20_000,
        allocations: [saleAllocation(lotId, -2_000)],
      },
    ]);
  });

  it("answers a line whose sale moved no stock with no allocations", async () => {
    const { deviceId, locationId, productId } = await soldOneProduct();
    await sold(deviceId, [aSoldLine(productId, "Azúcar 1 kg", 1, 4_000)]);

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map(({ amount, allocations }) => [amount, allocations])).toEqual([[4_000, []]]);
  });

  it("keeps the lines of two sales apart and adds up the allocations of one line on one lot", async () => {
    const { deviceId, locationId, cashierId, productId } = await soldOneProduct();
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId: cashierId });
    const first = aSoldLine(productId, "Azúcar 1 kg", 3, 30_000);
    const second = aSoldLine(productId, "Azúcar 1 kg", 1, 10_000);
    const firstSale = await sold(deviceId, [first]);
    const secondSale = await sold(deviceId, [second]);
    for (const quantity of [-1_000, -2_000]) {
      await insertSaleMovement(db, {
        productId,
        locationId,
        actorId: cashierId,
        saleLineId: first.id,
        allocations: [{ lotId, quantity }],
      });
    }
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId: cashierId,
      saleLineId: second.id,
      allocations: [{ lotId, quantity: -1_000 }],
    });

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(
      lines
        .map(({ saleId, amount, allocations }) => [saleId, amount, allocations])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual(
      [
        [firstSale, 30_000, [saleAllocation(lotId, -3_000)]],
        [secondSale, 10_000, [saleAllocation(lotId, -1_000)]],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });

  it("carries a technical lot and a lot with an incomplete cost as they are stored", async () => {
    const { deviceId, locationId, cashierId, productId } = await soldOneProduct();
    const technicalLotId = await insertTechnicalLot(db, {
      productId,
      locationId,
      remaining: -1_000,
    });
    const { lotId: countedLotId } = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId: cashierId,
    });
    const line = aSoldLine(productId, "Azúcar 1 kg", 2, 20_000);
    await sold(deviceId, [line]);
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId: cashierId,
      saleLineId: line.id,
      allocations: [
        { lotId: technicalLotId, quantity: -1_000 },
        { lotId: countedLotId, quantity: -1_000 },
      ],
    });

    const [only] = ordered(
      await reader().completedSaleLinesByProduct({
        locationId,
        range: wholeOctober,
        registerId: undefined,
      }),
    );

    expect(only?.allocations).toEqual(
      expect.arrayContaining([
        saleAllocation(technicalLotId, -1_000, {
          technical: true,
          costIncomplete: true,
          cost: null,
        }),
        saleAllocation(countedLotId, -1_000, { costIncomplete: true, cost: null }),
      ]),
    );
    expect(only?.allocations).toHaveLength(2);
  });

  it("names a product by its current name and answers its brand name and net content", async () => {
    const { deviceId, locationId, categoryId } = await soldOneProduct();
    const product = await insertProductIn(db, categoryId, "Yerba");
    await sold(deviceId, [aSoldLine(product, "Yerba vieja", 1, 3_000)]);
    await db.update(products).set({ name: "Yerba mate 1 kg" }).where(eq(products.id, product));

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map((line) => line.path)).toEqual([["Yerba mate 1 kg"]]);
  });

  it("names a product that is not in the catalog by the name its sale line carries", async () => {
    const { deviceId, locationId } = await aRegister();
    const unknown = randomUUID();
    await sold(deviceId, [aSoldLine(unknown, "Producto retirado", 1, 500)]);

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map(({ id, path }) => [id, path])).toEqual([[unknown, ["Producto retirado"]]]);
  });

  it("leaves out voided and cancelled sales", async () => {
    const { deviceId, locationId, productId } = await soldOneProduct();
    const kept = await sold(deviceId, [aSoldLine(productId, "Azúcar 1 kg", 1, 800)]);
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: SOLD,
      total: 9_000,
      overrides: { lines: [aSoldLine(productId, "Azúcar 1 kg", 9, 9_000)] },
    });
    await applyVoidedSale(db, {
      deviceId,
      completedAt: SOLD,
      voidedAt: SOLD,
      completed: { lines: [aSoldLine(productId, "Azúcar 1 kg", 7, 7_000)], total: 7_000 },
    });

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map((line) => [line.saleId, line.amount])).toEqual([[kept, 800]]);
  });

  it("dates a line by the Argentina calendar day its sale was completed", async () => {
    const { deviceId, locationId, productId } = await soldOneProduct();
    const at = (completedAt: string) => new Date(completedAt);
    await sold(
      deviceId,
      [aSoldLine(productId, "Azúcar 1 kg", 1, 1)],
      at("2026-10-05T02:59:00.000Z"),
    );
    await sold(
      deviceId,
      [aSoldLine(productId, "Azúcar 1 kg", 1, 20)],
      at("2026-10-05T03:00:00.000Z"),
    );
    await sold(
      deviceId,
      [aSoldLine(productId, "Azúcar 1 kg", 1, 300)],
      at("2026-10-07T02:59:00.000Z"),
    );
    await sold(
      deviceId,
      [aSoldLine(productId, "Azúcar 1 kg", 1, 4_000)],
      at("2026-10-07T03:00:00.000Z"),
    );

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(lines.map((line) => line.amount).sort((a, b) => a - b)).toEqual([20, 300]);
  });

  it("limits the lines to the asked register and never shows another branch's", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const otherLocation = await insertLocation(db);
    const elsewhere = await aRegister("Caja 9", otherLocation);
    const categoryId = await insertCategoryNamed(db, "Almacén");
    const product = await insertProductIn(db, categoryId, "Sal");
    await sold(first.deviceId, [aSoldLine(product, "Sal", 1, 1_000)]);
    await sold(second.deviceId, [aSoldLine(product, "Sal", 4, 250)]);
    await sold(elsewhere.deviceId, [aSoldLine(product, "Sal", 7, 7_000)]);

    const ofTheBranch = await reader().completedSaleLinesByProduct({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofTheSecondRegister = await reader().completedSaleLinesByProduct({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });
    const ofAnotherBranchsRegister = await reader().completedSaleLinesByProduct({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: elsewhere.registerId,
    });

    expect(ofTheBranch.map((line) => line.amount).sort((a, b) => a - b)).toEqual([250, 1_000]);
    expect(ofTheSecondRegister.map((line) => line.amount)).toEqual([250]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("never takes the allocations of another branch's stock movements", async () => {
    const { deviceId, locationId, cashierId, productId } = await soldOneProduct();
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId: cashierId });
    const line = aSoldLine(productId, "Azúcar 1 kg", 1, 10_000);
    await sold(deviceId, [line]);
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId: cashierId,
      saleLineId: line.id,
      allocations: [{ lotId, quantity: -1_000 }],
    });
    const other = await aRegister("Caja 9", await insertLocation(db));
    const otherLine = aSoldLine(productId, "Azúcar 1 kg", 1, 10_000);
    await sold(other.deviceId, [otherLine]);

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map((one) => one.allocations.length)).toEqual([1]);
  });

  it("reports nothing for a range without sales", async () => {
    const { locationId } = await aRegister();

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines).toEqual([]);
  });
});

describe("DrizzleSaleMarginReportReader.completedSaleLinesByCategory", () => {
  it("answers the lines under the category of their product, with the path from the root", async () => {
    const { deviceId, locationId } = await aRegister();
    const grocery = await insertCategoryNamed(db, "Almacén");
    const sweets = await insertCategoryNamed(db, "Dulces", grocery);
    const honey = await insertProductIn(db, sweets, "Miel");
    const rice = await insertProductIn(db, grocery, "Arroz");
    await sold(deviceId, [aSoldLine(honey, "Miel", 1, 5_000), aSoldLine(rice, "Arroz", 3, 3_000)]);

    const lines = await reader().completedSaleLinesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(
      lines
        .map(({ id, path, brandName, netContent, amount }) => ({
          id,
          path,
          brandName,
          netContent,
          amount,
        }))
        .sort((a, b) => a.path.join().localeCompare(b.path.join())),
    ).toEqual([
      { id: grocery, path: ["Almacén"], brandName: null, netContent: null, amount: 3_000 },
      { id: sweets, path: ["Almacén", "Dulces"], brandName: null, netContent: null, amount: 5_000 },
    ]);
  });

  it("puts a product that is not in the catalog under no category", async () => {
    const { deviceId, locationId } = await aRegister();
    await sold(deviceId, [aSoldLine(randomUUID(), "Retirado", 1, 500)]);

    const lines = await reader().completedSaleLinesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map(({ id, path, amount }) => [id, path, amount])).toEqual([[null, [], 500]]);
  });

  it("answers the allocations of the lines like the product read does", async () => {
    const { deviceId, locationId, cashierId, productId } = await soldOneProduct();
    const lotId = await insertPurchasedLot(db, { productId, locationId, actorId: cashierId });
    const line = aSoldLine(productId, "Azúcar 1 kg", 2, 20_000);
    await sold(deviceId, [line]);
    await insertSaleMovement(db, {
      productId,
      locationId,
      actorId: cashierId,
      saleLineId: line.id,
      allocations: [{ lotId, quantity: -2_000 }],
    });

    const lines = await reader().completedSaleLinesByCategory({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(lines.map((one) => one.allocations)).toEqual([[saleAllocation(lotId, -2_000)]]);
  });

  it("leaves out voided and cancelled sales, other branches, other registers and other days", async () => {
    const own = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const elsewhere = await aRegister("Caja 9", await insertLocation(db));
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
      cancelledAt: SOLD,
      total: 5_000_000,
      overrides: { lines: [aSoldLine(product, "Sal", 1, 5_000_000)] },
    });

    const ofTheBranch = await reader().completedSaleLinesByCategory({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofTheSecondRegister = await reader().completedSaleLinesByCategory({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(ofTheBranch.map((line) => line.amount).sort((a, b) => a - b)).toEqual([100, 20_000]);
    expect(ofTheSecondRegister.map((line) => line.amount)).toEqual([20_000]);
  });
});

describe("DrizzleSaleMarginReportReader with returns", () => {
  async function returnedLine(disposition: "restock" | "discard", registerName = "Caja 1") {
    const refundedAmount = 10_000;
    const own = await aRegister(registerName);
    const cashierId = await aCashier(own.locationId);
    const categoryId = await insertCategoryNamed(db, `Almacén ${registerName}`);
    const productId = await insertProductIn(db, categoryId, "Azúcar 1 kg");
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId: own.locationId,
      actorId: cashierId,
      remaining: 8_000,
    });
    const line = aSoldLine(productId, "Azúcar 1 kg", 2, 20_000);
    const returnedMovement = {
      id: randomUUID(),
      saleLineId: line.id,
      productId,
      kind: "return" as const,
      reason: null,
      delta: 1_000,
    };
    const { completed } = await applyReturn(db, {
      deviceId: own.deviceId,
      soldAt: SOLD,
      returnedAt: RETURNED_LATER,
      applyStock: true,
      sale: { actorId: cashierId, total: 20_000, lines: [line] },
      saleReturn: {
        actorId: cashierId,
        lines: [
          {
            saleLineId: line.id,
            productId,
            quantity: 1,
            reason: "defective",
            disposition,
            refundedAmount,
          },
        ],
        stockMovements:
          disposition === "restock"
            ? [returnedMovement]
            : [
                returnedMovement,
                {
                  id: randomUUID(),
                  saleLineId: line.id,
                  productId,
                  kind: "loss" as const,
                  reason: "return_discard" as const,
                  delta: -1_000,
                },
              ],
      },
      afterSale: async () => {
        await insertSaleMovement(db, {
          productId,
          locationId: own.locationId,
          actorId: cashierId,
          saleLineId: line.id,
          allocations: [{ lotId, quantity: -2_000 }],
        });
      },
    });
    return { ...own, productId, lotId, saleId: completed.id };
  }

  it("lowers a line's amount by what was refunded for it, whenever the return was made", async () => {
    const { locationId, productId, saleId, lotId } = await returnedLine("restock");

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(ordered(lines)).toEqual([
      {
        saleId,
        id: productId,
        path: ["Azúcar 1 kg"],
        brandName: null,
        netContent: null,
        amount: 10_000,
        allocations: [
          saleAllocation(lotId, -2_000),
          saleAllocation(lotId, 1_000, { movementKind: "return" }),
        ],
      },
    ]);
  });

  it("answers the units of a discarded return as returned to the lots, without the loss", async () => {
    const { locationId, lotId } = await returnedLine("discard");

    const lines = await reader().completedSaleLinesByProduct({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(ordered(lines)[0]?.allocations).toEqual([
      saleAllocation(lotId, -2_000),
      saleAllocation(lotId, 1_000, { movementKind: "return" }),
    ]);
  });

  it("answers the same cost of sales for the units that came back, restocked or discarded", async () => {
    const restocked = await returnedLine("restock", "Caja 1");
    const discarded = await returnedLine("discard", "Caja 2");
    const margin = (registerId: string) =>
      readMarginReport(
        { reader: reader(), clock: { now: () => NOW }, zoneRules: fixedZoneRulesSource() },
        {
          locationId: restocked.locationId,
          asked: wholeOctober,
          registerId,
          group: "product",
        },
      );

    const ofRestocked = await margin(restocked.registerId);
    const ofDiscarded = await margin(discarded.registerId);

    expect(ofRestocked.totals).toEqual({
      amount: 10_000,
      cost: 5_000,
      margin: 5_000,
      incompleteSales: 0,
    });
    expect(ofDiscarded.totals).toEqual(ofRestocked.totals);
  });
});
