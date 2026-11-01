import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assemblyBatches } from "../platform/db/schema.js";
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

  it("breaks a tie on the creation moment by the greater lot id", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const first = await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2026-09-20");
    const second = await purchased(yerba.id, "2026-09-01T12:00:00.000Z", "2026-10-20");

    const [found] = await reader().newestShelfLifeLots(locationId);

    expect(found?.expiresOn).toBe(first > second ? "2026-09-20" : "2026-10-20");
  });

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
