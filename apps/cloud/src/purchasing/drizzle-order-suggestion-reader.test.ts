import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assemblyBatches, lots, purchaseOrders } from "../platform/db/schema.js";
import { insertAssemblyBatch } from "../stock/test-support/assembly-batch-fixtures.js";
import { insertInitialCountLot, insertPurchasedLot } from "../stock/test-support/lot-fixtures.js";
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
import { insertAnotherLocation } from "./test-support/purchase-order-fixtures.js";
import { insertSentOrder, receiveOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

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

describe("the suppliers", () => {
  it("answers every supplier with whether it is active", async () => {
    const actorId = await insertActor(db);
    const active = await insertSupplier(db, { actorId, name: "Granos del Valle" });
    const inactive = await insertSupplier(db, { actorId, name: "Cerealera", active: false });

    const suppliers = await reader().suppliers();

    expect(suppliers).toHaveLength(2);
    expect(suppliers).toEqual(
      expect.arrayContaining([
        { id: active, name: "Granos del Valle", active: true },
        { id: inactive, name: "Cerealera", active: false },
      ]),
    );
  });
});

describe("the newest lots that count for the shelf life", () => {
  async function purchased(
    productId: string,
    createdAt: string,
    expiresOn: string | null,
    branch = locationId,
  ) {
    return insertPurchasedLot(db, {
      productId,
      locationId: branch,
      actorId: await insertActor(db),
      createdAt: new Date(createdAt),
      expiresOn,
    });
  }

  it("answers the most recent lot of each product with when it was created and when it expires", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2026-12-01");
    await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2026-09-20");
    await purchased(harina.id, "2026-09-05T12:00:00.000Z", "2026-10-05");

    const lotsFound = await reader().newestShelfLifeLots(locationId);

    expect(lotsFound).toHaveLength(2);
    expect(lotsFound).toEqual(
      expect.arrayContaining([
        {
          productId: yerba.id,
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          expiresOn: "2026-09-20",
        },
        {
          productId: harina.id,
          createdAt: new Date("2026-09-05T12:00:00.000Z"),
          expiresOn: "2026-10-05",
        },
      ]),
    );
  });

  it("prefers the newest lot even when an older one lives longer", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2026-09-20");
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2027-08-01");

    expect(await reader().newestShelfLifeLots(locationId)).toMatchObject([
      { expiresOn: "2026-09-20" },
    ]);
  });

  it("prefers the newest lot even when an older one expires sooner", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2026-08-10");
    await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2027-09-01");

    expect(await reader().newestShelfLifeLots(locationId)).toMatchObject([
      { expiresOn: "2027-09-01" },
    ]);
  });

  it.each([
    ["later", "ffffffff-ffff-4fff-bfff-ffffffffffff", "2027-01-15", "2026-11-10"],
    ["sooner", "00000000-0000-4000-8000-000000000000", "2026-10-20", "2026-10-20"],
  ])(
    "takes the soonest expiry among the lots of a line split on the same creation moment, when the split units expire %s",
    async (_when, splitLotId, splitExpiresOn, shelfLifeExpiresOn) => {
      const yerba = await insertProduct(db, { name: "Yerba" });
      const ownLotId = await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2026-11-10");
      const [own] = await db.select().from(lots).where(eq(lots.id, ownLotId));
      await db.insert(lots).values({
        id: splitLotId,
        productId: yerba.id,
        locationId,
        purchaseLineId: own?.purchaseLineId,
        splitFromLotId: ownLotId,
        purchasedOn: own?.purchasedOn,
        expiresOn: splitExpiresOn,
        costTotalCents: own?.costTotalCents,
        costQuantity: own?.costQuantity,
        quantityReceived: 1_000,
        remaining: 1_000,
        createdAt: own?.createdAt,
      });

      expect(await reader().newestShelfLifeLots(locationId)).toEqual([
        {
          productId: yerba.id,
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          expiresOn: shelfLifeExpiresOn,
        },
      ]);
    },
  );

  it("counts a lot that came from an assembly batch", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2026-12-01");
    await insertAssemblyBatch(db, {
      productId: yerba.id,
      locationId,
      actorId: await insertActor(db),
      assembledAt: new Date("2026-09-02T12:00:00.000Z"),
      expiresOn: "2026-09-12",
      lotCreatedAt: new Date("2026-09-02T12:00:00.000Z"),
    });

    expect(await reader().newestShelfLifeLots(locationId)).toEqual([
      {
        productId: yerba.id,
        createdAt: new Date("2026-09-02T12:00:00.000Z"),
        expiresOn: "2026-09-12",
      },
    ]);
  });

  it("ignores a lot from a voided assembly batch", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const actorId = await insertActor(db);
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2026-12-01");
    const { batchId } = await insertAssemblyBatch(db, {
      productId: yerba.id,
      locationId,
      actorId,
      assembledAt: new Date("2026-09-02T12:00:00.000Z"),
      expiresOn: "2026-09-12",
      lotCreatedAt: new Date("2026-09-02T12:00:00.000Z"),
    });
    await db
      .update(assemblyBatches)
      .set({ voidedAt: new Date("2026-09-03T12:00:00.000Z"), voidedBy: actorId })
      .where(eq(assemblyBatches.id, batchId));

    expect(await reader().newestShelfLifeLots(locationId)).toMatchObject([
      { expiresOn: "2026-12-01" },
    ]);
  });

  it("ignores a lot loaded by the initial count", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2026-12-01");
    await insertInitialCountLot(db, {
      productId: yerba.id,
      locationId,
      actorId: await insertActor(db),
      expiresOn: "2026-09-12",
      createdAt: new Date("2026-09-02T12:00:00.000Z"),
    });

    expect(await reader().newestShelfLifeLots(locationId)).toMatchObject([
      { expiresOn: "2026-12-01" },
    ]);
  });

  it("ignores a lot without an expiry date", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    await purchased(yerba.id, "2026-08-01T12:00:00.000Z", "2026-12-01");
    await purchased(yerba.id, "2026-09-01T12:00:00.000Z", null);

    expect(await reader().newestShelfLifeLots(locationId)).toMatchObject([
      { expiresOn: "2026-12-01" },
    ]);
  });

  it("leaves out the lots of other branches and answers nothing for a product with no lot that counts", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const otherBranch = await insertLocation(db);
    await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2026-09-20", otherBranch);

    expect(await reader().newestShelfLifeLots(locationId)).toEqual([]);
  });
});

describe("the awaited order lines", () => {
  function sentOrder(name: string, packages = 3, forLocationId = locationId) {
    return insertSentOrder(db, {
      actorId: ownerId,
      locationId: forLocationId,
      products: [{ name, packages, quantityPerPackage: 12_000, packagePriceCents: 3_000 }],
    });
  }

  function packagesOf(productId: string, packages: number) {
    return {
      loadedBy: "packages" as const,
      productId,
      packages,
      quantityPerPackage: 12_000,
      costPaidCents: 3_000,
      expiresOn: null,
    };
  }

  let ownerId: string;

  beforeEach(async () => {
    ownerId = await insertActor(db);
  });

  it("answers the lines of a sent order with nothing received yet", async () => {
    const { productIds } = await sentOrder("Yerba");

    expect(await reader().awaitedOrderLines(locationId)).toEqual([
      {
        productId: productIds[0],
        state: "SENT",
        packages: 3,
        quantityPerPackage: 12_000,
        receivedQuantity: 0,
      },
    ]);
  });

  it("sums what several receipts brought of a line", async () => {
    const { orderId, productIds } = await sentOrder("Yerba");
    const [productId] = productIds as [string];
    for (const at of [new Date("2026-03-10T12:00:00.000Z"), new Date("2026-03-11T12:00:00.000Z")]) {
      await receiveOrder(db, {
        locationId,
        orderId,
        actorId: ownerId,
        lines: [packagesOf(productId, 1)],
        at,
      });
    }

    expect(await reader().awaitedOrderLines(locationId)).toEqual([
      {
        productId,
        state: "PARTIALLY_RECEIVED",
        packages: 3,
        quantityPerPackage: 12_000,
        receivedQuantity: 24_000,
      },
    ]);
  });

  it("leaves out the orders of other branches", async () => {
    const otherBranch = await insertAnotherLocation(db);
    await sentOrder("Yerba", 3, otherBranch);

    expect(await reader().awaitedOrderLines(locationId)).toEqual([]);
  });

  it("leaves out the lines of a draft, a received and a cancelled order", async () => {
    const draft = await sentOrder("Yerba");
    await db
      .update(purchaseOrders)
      .set({ state: "DRAFT", sentAt: null, sentBy: null })
      .where(eq(purchaseOrders.id, draft.orderId));
    const cancelled = await sentOrder("Harina");
    await db
      .update(purchaseOrders)
      .set({ state: "CANCELLED", cancelledAt: NOW, cancelledBy: ownerId })
      .where(eq(purchaseOrders.id, cancelled.orderId));
    const received = await sentOrder("Fideos", 1);
    await receiveOrder(db, {
      locationId,
      orderId: received.orderId,
      actorId: ownerId,
      lines: [packagesOf(received.productIds[0] as string, 1)],
    });

    expect(await reader().awaitedOrderLines(locationId)).toEqual([]);
  });
});
