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
      { id, name: "Harina", categoryName: category?.name, saleUnit: "KG" },
    ]);
  });
});

describe("the offers of the suppliers", () => {
  async function linkedItem(supplierId: string, productId: string, packagingName = "Caja x 10") {
    const packagingId = await insertPackaging(db, {
      productId,
      actorId,
      name: packagingName,
      quantityPerPackage: 10_000,
    });
    const itemId = await insertSupplierItem(db, {
      supplierId,
      productId,
      packagingId,
      vatRate: 1_050,
    });
    return { itemId, packagingId };
  }

  it("answers the latest price of each linked item with its packaging, supplier and VAT, ordered by supplier name", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const zetaId = await insertSupplier(db, { actorId, name: "Zeta" });
    const alfaId = await insertSupplier(db, { actorId, name: "Alfa" });
    const zeta = await linkedItem(zetaId, productId, "Bolsa x 10");
    const alfa = await linkedItem(alfaId, productId);
    await insertSupplierItemPrice(db, {
      itemId: zeta.itemId,
      listId: await confirmedList(zetaId),
      priceCents: 1_000,
      listDate: "2026-03-01",
      pricesIncludeVat: false,
    });
    await insertSupplierItemPrice(db, {
      itemId: alfa.itemId,
      listId: await confirmedList(alfaId),
      priceCents: 2_000,
      listDate: "2026-03-02",
      pricesIncludeVat: true,
    });

    expect(await reader().offers()).toEqual([
      {
        productId,
        supplier: { id: alfaId, name: "Alfa" },
        packaging: { name: "Caja x 10", quantityPerPackage: 10_000 },
        priceCents: 2_000,
        pricesIncludeVat: true,
        vatRate: 1_050,
        listDate: "2026-03-02",
      },
      {
        productId,
        supplier: { id: zetaId, name: "Zeta" },
        packaging: { name: "Bolsa x 10", quantityPerPackage: 10_000 },
        priceCents: 1_000,
        pricesIncludeVat: false,
        vatRate: 1_050,
        listDate: "2026-03-01",
      },
    ]);
  });

  it("answers only the latest price of an item by list date, the one confirmed later winning a tie", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const supplierId = await insertSupplier(db, { actorId });
    const { itemId } = await linkedItem(supplierId, productId);
    const entries = [
      { listDate: "2026-02-01", confirmedAt: "2026-05-01T10:00:00Z", priceCents: 100 },
      { listDate: "2026-03-01", confirmedAt: "2026-03-02T10:00:00Z", priceCents: 200 },
      { listDate: "2026-03-01", confirmedAt: "2026-03-03T10:00:00Z", priceCents: 300 },
    ];
    for (const entry of entries) {
      await insertSupplierItemPrice(db, {
        itemId,
        listId: await confirmedList(supplierId),
        priceCents: entry.priceCents,
        listDate: entry.listDate,
        confirmedAt: new Date(entry.confirmedAt),
      });
    }

    const offers = await reader().offers();

    expect(offers.map((offer) => offer.priceCents)).toEqual([300]);
  });

  it("leaves out an item that is not linked or has no recorded price", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const supplierId = await insertSupplier(db, { actorId });
    const unlinkedId = await insertSupplierItem(db, { supplierId });
    await insertSupplierItemPrice(db, {
      itemId: unlinkedId,
      listId: await confirmedList(supplierId),
    });
    await linkedItem(supplierId, productId);

    expect(await reader().offers()).toEqual([]);
  });
});
