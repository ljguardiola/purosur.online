import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInitialCountLotReader } from "./drizzle-initial-count-lot-reader.js";
import { insertLoadedSupplierPrice } from "./test-support/loaded-supplier-price-fixtures.js";
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
  it("lists the lots of the initial count, withdrawn or not, with their product, category, cost and what they hold", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      categoryName: "Frutos secos",
      saleUnit: "KG",
      brandName: "Vitora",
      netContent: { quantity: 250, unit: "G" },
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
    const withdrawn = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      counted: 3_000,
      remaining: 0,
      withdrawn: true,
    });
    await insertPurchasedLot(db, { productId, locationId, actorId });

    const rows = await new DrizzleInitialCountLotReader(db).initialCountLots({
      locationId,
      costIncomplete: undefined,
      productName: undefined,
    });

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          lotId: unknown.lotId,
          productId,
          productName: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: "2027-02-01",
          counted: 2_500,
          withdrawn: false,
          remaining: 1_000,
          costIncomplete: true,
          cost: null,
          supplierPrices: [],
        },
        {
          lotId: known.lotId,
          productId,
          productName: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: null,
          counted: 4_000,
          withdrawn: false,
          remaining: 4_000,
          costIncomplete: false,
          cost: { totalCents: 3_500, quantity: 1_000 },
          supplierPrices: [],
        },
        {
          lotId: withdrawn.lotId,
          productId,
          productName: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          categoryName: "Frutos secos",
          saleUnit: "KG",
          expiresOn: null,
          counted: 3_000,
          withdrawn: true,
          remaining: 0,
          costIncomplete: true,
          cost: null,
          supplierPrices: [],
        },
      ]),
    );
  });

  it("leaves out the lots of other branches", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const otherLocationId = await insertLocation(db);
    const { productId } = await insertProduct(db);
    await insertInitialCountLot(db, { productId, locationId: otherLocationId, actorId });

    const rows = await new DrizzleInitialCountLotReader(db).initialCountLots({
      locationId,
      costIncomplete: undefined,
      productName: undefined,
    });

    expect(rows).toEqual([]);
  });

  it("finds the lots of a product by its name whatever the accents and the case", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const { productId } = await insertProduct(db, { name: "Aceto Balsámico Clásico" });
    const lot = await insertInitialCountLot(db, { productId, locationId, actorId });
    const { productId: otherProductId } = await insertProduct(db, { name: "Almendras peladas" });
    await insertInitialCountLot(db, { productId: otherProductId, locationId, actorId });
    const reader = new DrizzleInitialCountLotReader(db);
    const lotIds = async (productName: string) =>
      (await reader.initialCountLots({ locationId, costIncomplete: undefined, productName })).map(
        (row) => row.lotId,
      );

    expect(await lotIds("balsamico CLASICO")).toEqual([lot.lotId]);
  });

  it("finds the lots of a product by its name followed by its brand's name", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      brandName: "Vitora",
    });
    const lot = await insertInitialCountLot(db, { productId, locationId, actorId });
    const { productId: otherProductId } = await insertProduct(db, { name: "Almendras tostadas" });
    await insertInitialCountLot(db, { productId: otherProductId, locationId, actorId });
    const reader = new DrizzleInitialCountLotReader(db);
    const lotIds = async (productName: string) =>
      (await reader.initialCountLots({ locationId, costIncomplete: undefined, productName })).map(
        (row) => row.lotId,
      );

    expect(await lotIds("VITORA")).toEqual([lot.lotId]);
    expect(await lotIds("peladas vitora")).toEqual([lot.lotId]);
  });

  it("finds the lots of a product by every word of its shown description, net content included, in any order", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const otherLocationId = await insertLocation(db);
    const oilOf = (quantity: number) =>
      insertProduct(db, {
        name: "Aceite de Almendras",
        brandName: "Vitora",
        netContent: { quantity, unit: "ML" },
      });
    const small = await oilOf(30);
    const large = await oilOf(60);
    const smallLot = await insertInitialCountLot(db, { ...small, locationId, actorId });
    const largeLots = [
      await insertInitialCountLot(db, { ...large, locationId, actorId }),
      await insertInitialCountLot(db, { ...large, locationId, actorId, unitCostCents: 900 }),
    ];
    await insertPurchasedLot(db, { ...large, locationId, actorId });
    await insertInitialCountLot(db, { ...large, locationId: otherLocationId, actorId });
    const reader = new DrizzleInitialCountLotReader(db);
    const lotIds = async (productName: string) =>
      (await reader.initialCountLots({ locationId, costIncomplete: undefined, productName }))
        .map((row) => row.lotId)
        .sort();

    expect(await lotIds("vitora 60")).toEqual(largeLots.map((lot) => lot.lotId).sort());
    expect(await lotIds("30 ML aceite VITORA")).toEqual([smallLot.lotId]);
    expect(await lotIds("almendras vitora")).toEqual(
      [smallLot, ...largeLots].map((lot) => lot.lotId).sort(),
    );
  });

  it("combines the description search with the cost filter", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const product = await insertProduct(db, { name: "Aceite de Almendras", brandName: "Vitora" });
    await insertInitialCountLot(db, { ...product, locationId, actorId });
    const known = await insertInitialCountLot(db, {
      ...product,
      locationId,
      actorId,
      unitCostCents: 100,
    });

    const rows = await new DrizzleInitialCountLotReader(db).initialCountLots({
      locationId,
      costIncomplete: false,
      productName: "vitora aceite",
    });

    expect(rows.map((row) => row.lotId)).toEqual([known.lotId]);
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
        await reader.initialCountLots({
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
        await reader.initialCountLots({
          locationId,
          costIncomplete: undefined,
          productName,
        })
      ).map((row) => row.lotId);

    expect(await lotIds("MATE")).toEqual([yerbaLot.lotId]);
    expect(await lotIds("%")).toEqual([percentLot.lotId]);
    expect(await lotIds("_")).toEqual([]);
  });

  it("gives each lot the prices loaded for its own product", async () => {
    const { userId: actorId, locationId } = await signedInWith(db, [], new Date());
    const yerba = await insertProduct(db, { name: "Yerba mate 1 kg" });
    const harina = await insertProduct(db, { name: "Harina 1 kg" });
    const first = await insertInitialCountLot(db, { ...yerba, locationId, actorId });
    const second = await insertInitialCountLot(db, { ...yerba, locationId, actorId });
    const withoutPrices = await insertInitialCountLot(db, { ...harina, locationId, actorId });
    const { supplierItemId } = await insertLoadedSupplierPrice(db, {
      productId: yerba.productId,
      actorId,
      priceCents: 1_000,
    });

    const rows = await new DrizzleInitialCountLotReader(db).initialCountLots({
      locationId,
      costIncomplete: undefined,
      productName: undefined,
    });

    const pricesOf = (lotId: string) =>
      rows.find((row) => row.lotId === lotId)?.supplierPrices.map((price) => price.supplierItemId);
    expect(pricesOf(first.lotId)).toEqual([supplierItemId]);
    expect(pricesOf(second.lotId)).toEqual([supplierItemId]);
    expect(pricesOf(withoutPrices.lotId)).toEqual([]);
  });
});
