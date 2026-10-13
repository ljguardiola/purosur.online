import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInitialCountLotReader } from "./drizzle-initial-count-lot-reader.js";
import { insertInitialCountLot, insertPurchasedLot } from "./test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

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

describe("DrizzleInitialCountLotReader", () => {
  it("lists the lots of the initial count not withdrawn, with their product, category and cost", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
    });
    const unknown = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      counted: 2_500,
      remaining: 1_000,
      expiresOn: "2027-02-01",
    });
    const known = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      counted: 4_000,
      unitCostCents: 3_500,
    });
    await insertInitialCountLot(db, { productId, locationId, actorId, withdrawn: true });
    await insertPurchasedLot(db, { productId, locationId, actorId });

    const rows = await new DrizzleInitialCountLotReader(db).notWithdrawnInitialCountLots({
      locationId,
      costIncomplete: undefined,
      productName: undefined,
    });

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          lotId: unknown.lotId,
          productId,
          productName: "Almendras peladas",
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: "2027-02-01",
          counted: 2_500,
          costIncomplete: true,
          cost: null,
        },
        {
          lotId: known.lotId,
          productId,
          productName: "Almendras peladas",
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: null,
          counted: 4_000,
          costIncomplete: false,
          cost: { totalCents: 3_500, quantity: 1_000 },
        },
      ]),
    );
  });

  it("leaves out the lots of other branches", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    await insertInitialCountLot(db, { productId, locationId: otherLocationId, actorId });

    const rows = await new DrizzleInitialCountLotReader(db).notWithdrawnInitialCountLots({
      locationId,
      costIncomplete: undefined,
      productName: undefined,
    });

    expect(rows).toEqual([]);
  });

  it("keeps the lots whose cost is incomplete or known, as asked", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const { productId } = await insertProduct(db);
    const unknown = await insertInitialCountLot(db, { productId, locationId, actorId });
    const known = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      unitCostCents: 100,
    });
    const reader = new DrizzleInitialCountLotReader(db);
    const lotIds = async (costIncomplete: boolean) =>
      (
        await reader.notWithdrawnInitialCountLots({
          locationId,
          costIncomplete,
          productName: undefined,
        })
      ).map((row) => row.lotId);

    expect(await lotIds(true)).toEqual([unknown.lotId]);
    expect(await lotIds(false)).toEqual([known.lotId]);
  });

  it("keeps the lots whose product name contains the text, whatever its case, taking % and _ literally", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const yerba = await insertProduct(db, { name: "Yerba mate 1 kg" });
    const percent = await insertProduct(db, { name: "Jugo 100% natural" });
    const yerbaLot = await insertInitialCountLot(db, { ...yerba, locationId, actorId });
    const percentLot = await insertInitialCountLot(db, { ...percent, locationId, actorId });
    const reader = new DrizzleInitialCountLotReader(db);
    const lotIds = async (productName: string) =>
      (
        await reader.notWithdrawnInitialCountLots({
          locationId,
          costIncomplete: undefined,
          productName,
        })
      ).map((row) => row.lotId);

    expect(await lotIds("MATE")).toEqual([yerbaLot.lotId]);
    expect(await lotIds("%")).toEqual([percentLot.lotId]);
    expect(await lotIds("_")).toEqual([]);
  });
});
