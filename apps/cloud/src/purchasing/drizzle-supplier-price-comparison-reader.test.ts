import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceComparisonReader } from "./drizzle-supplier-price-comparison-reader.js";
import { insertActor, insertPackaging, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;

const reader = () => new DrizzleSupplierPriceComparisonReader(db);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
});

const confirmedList = (supplierId: string) =>
  insertPriceList(db, { supplierId, locationId, actorId, state: "REVIEWED" });

describe("the products to compare", () => {
  it("answers the active products with their category and sale unit", async () => {
    const { id } = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    await insertProduct(db, { name: "Retirado", active: false });
    const [category] = await db.select({ name: categories.name }).from(categories);

    expect(await reader().activeProducts()).toEqual([
      {
        id,
        name: "Harina",
        brandName: null,
        netContent: null,
        categoryName: category?.name,
        saleUnit: "KG",
      },
    ]);
  });

  it("answers each active product's brand name and net content", async () => {
    const { id } = await insertProduct(db, {
      name: "Aceite de Almendras",
      brandName: "Vitora",
      netContent: { quantity: 30, unit: "ML" },
    });

    expect(await reader().activeProducts()).toMatchObject([
      { id, brandName: "Vitora", netContent: { quantity: 30, unit: "ML" } },
    ]);
  });
});

describe("the offers of the suppliers", () => {
  it("answers the latest offer of each linked item", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    const packagingId = await insertPackaging(db, {
      productId,
      actorId,
      name: "Caja x 10",
      quantityPerPackage: 10_000,
    });
    const itemId = await insertSupplierItem(db, {
      supplierId,
      productId,
      packagingId,
      vatRate: 1_050,
    });
    await insertSupplierItemPrice(db, {
      itemId,
      listId: await confirmedList(supplierId),
      priceCents: 2_000,
      listDate: "2026-03-02",
      pricesIncludeVat: true,
    });

    expect(await reader().offers()).toEqual([
      {
        productId,
        supplier: { id: supplierId, name: "Alfa" },
        packaging: {
          name: "Caja x 10",
          quantityPerPackage: 10_000,
          active: true,
          saleUnit: "UNIT",
        },
        priceCents: 2_000,
        pricesIncludeVat: true,
        vatRate: 1_050,
        listDate: "2026-03-02",
      },
    ]);
  });
});
