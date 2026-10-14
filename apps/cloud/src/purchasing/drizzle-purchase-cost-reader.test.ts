import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertPurchasedLot } from "../stock/test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePurchaseCostReader } from "./drizzle-purchase-cost-reader.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";
import { insertPurchaseLine } from "./test-support/purchase-line-fixtures.js";

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

async function setUp() {
  const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
  const { productId } = await insertProduct(db);
  return { actorId, locationId, productId };
}

describe("DrizzlePurchaseCostReader.purchaseLineCostsOf", () => {
  it("answers every purchase line of the product with its exact cost pair and its dates", async () => {
    const { actorId, locationId, productId } = await setUp();
    const earlier = await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-02T15:00:00.000Z"),
      costPaidCents: 1001,
      quantityPerPackage: 2_000,
    });
    const later = await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-03-05",
      recordedAt: new Date("2026-03-05T12:00:00.000Z"),
      costPaidCents: 900,
      quantityPerPackage: 1_000,
    });

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual({
      productId,
      lineId: earlier,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-02T15:00:00.000Z"),
      cost: { totalCents: 1001, quantity: 2_000 },
      freights: [],
    });
    expect(lines).toContainEqual({
      productId,
      lineId: later,
      purchasedOn: "2026-03-05",
      recordedAt: new Date("2026-03-05T12:00:00.000Z"),
      cost: { totalCents: 900, quantity: 1_000 },
      freights: [],
    });
  });

  it("answers only the products asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    for (const id of [productId, otherId]) {
      await insertPurchaseLine(db, {
        productId: id,
        locationId,
        actorId,
        purchasedOn: "2026-03-01",
        recordedAt: new Date("2026-03-01T12:00:00.000Z"),
        costPaidCents: 100,
        quantityPerPackage: 1_000,
      });
    }

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      otherId,
    ]);

    expect(lines.map((line) => line.productId)).toEqual([otherId]);
  });

  it("answers nothing when no product is asked for", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchaseLine(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-01T12:00:00.000Z"),
      costPaidCents: 100,
      quantityPerPackage: 1_000,
    });

    expect(await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [])).toEqual([]);
  });

  it("answers only the branch's own purchases", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchaseLine(db, {
      productId,
      locationId: await insertLocation(db),
      actorId,
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-01T12:00:00.000Z"),
      costPaidCents: 100,
      quantityPerPackage: 1_000,
    });

    expect(
      await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [productId]),
    ).toEqual([]);
  });

  it("answers a purchase line once, though its lot exists too", async () => {
    const { actorId, locationId, productId } = await setUp();
    await insertPurchasedLot(db, { productId, locationId, actorId });

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(lines).toHaveLength(1);
  });
});

describe("DrizzlePurchaseCostReader.purchaseLineCostsOf freights", () => {
  async function purchaseOf(
    productId: string,
    locationId: string,
    actorId: string,
    lines: { costPaidCents: number; quantity: number }[],
  ) {
    return insertPurchaseWithLines(db, {
      locationId,
      actorId,
      lines: lines.map((line) => ({ productId, quantityPerPackage: 1_000, ...line })),
    });
  }

  it("answers a line with no freight when none covers its purchase", async () => {
    const { actorId, locationId, productId } = await setUp();
    await purchaseOf(productId, locationId, actorId, [{ costPaidCents: 100, quantity: 1_000 }]);

    const [line] = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(line?.freights).toEqual([]);
  });

  it("answers each line of a purchase with the freight covering it and all the lines it is distributed over", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const purchase = await insertPurchaseWithLines(db, {
      locationId,
      actorId,
      lines: [
        { productId, costPaidCents: 100, quantity: 1_000, quantityPerPackage: 1_000 },
        { productId: otherId, costPaidCents: 300, quantity: 2_000, quantityPerPackage: 1_000 },
      ],
    });
    await insertFreightRow(db, {
      locationId,
      actorId,
      purchaseIds: [purchase.purchaseId],
      amountCents: 4_000,
    });

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(lines).toHaveLength(1);
    const [freight] = lines[0]?.freights ?? [];
    expect(lines[0]?.freights).toHaveLength(1);
    expect(freight?.amountCents).toBe(4_000);
    expect(freight?.lines).toHaveLength(2);
    expect(freight?.lines).toEqual(
      expect.arrayContaining([
        { id: purchase.lineIds[0], costPaidCents: 100, quantity: 1_000, quantityPerPackage: 1_000 },
        { id: purchase.lineIds[1], costPaidCents: 300, quantity: 2_000, quantityPerPackage: 1_000 },
      ]),
    );
  });

  it("answers a freight over two purchases to each of them with the lines of both", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const first = await purchaseOf(productId, locationId, actorId, [
      { costPaidCents: 100, quantity: 1_000 },
    ]);
    const second = await purchaseOf(otherId, locationId, actorId, [
      { costPaidCents: 500, quantity: 1_000 },
    ]);
    await insertFreightRow(db, {
      locationId,
      actorId,
      purchaseIds: [first.purchaseId, second.purchaseId],
      amountCents: 6_000,
    });
    const reader = new DrizzlePurchaseCostReader(db);

    const [ofFirst] = await reader.purchaseLineCostsOf(locationId, [productId]);
    const [ofSecond] = await reader.purchaseLineCostsOf(locationId, [otherId]);

    for (const line of [ofFirst, ofSecond]) {
      expect(line?.freights).toHaveLength(1);
      expect(line?.freights[0]?.amountCents).toBe(6_000);
      expect(line?.freights[0]?.lines.map(({ id }) => id).sort()).toEqual(
        [first.lineIds[0], second.lineIds[0]].sort(),
      );
    }
  });

  it("answers every freight covering a purchase", async () => {
    const { actorId, locationId, productId } = await setUp();
    const purchase = await purchaseOf(productId, locationId, actorId, [
      { costPaidCents: 100, quantity: 1_000 },
    ]);
    for (const amountCents of [1_000, 2_500]) {
      await insertFreightRow(db, {
        locationId,
        actorId,
        purchaseIds: [purchase.purchaseId],
        amountCents,
      });
    }

    const [line] = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
    ]);

    expect(line?.freights.map(({ amountCents }) => amountCents).sort()).toEqual([1_000, 2_500]);
  });

  it("answers the freights of the lines of several products in one read", async () => {
    const { actorId, locationId, productId } = await setUp();
    const { productId: otherId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const first = await purchaseOf(productId, locationId, actorId, [
      { costPaidCents: 100, quantity: 1_000 },
    ]);
    await purchaseOf(otherId, locationId, actorId, [{ costPaidCents: 100, quantity: 1_000 }]);
    await insertFreightRow(db, {
      locationId,
      actorId,
      purchaseIds: [first.purchaseId],
      amountCents: 900,
    });

    const lines = await new DrizzlePurchaseCostReader(db).purchaseLineCostsOf(locationId, [
      productId,
      otherId,
    ]);

    expect(Object.fromEntries(lines.map((line) => [line.productId, line.freights.length]))).toEqual(
      { [productId]: 1, [otherId]: 0 },
    );
  });
});
