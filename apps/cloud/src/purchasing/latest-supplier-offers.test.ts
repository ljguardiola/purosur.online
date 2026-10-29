import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { latestSupplierOffers } from "./latest-supplier-offers.js";
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

describe("latestSupplierOffers", () => {
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

    expect(await latestSupplierOffers(db)).toEqual([
      {
        supplierItemId: alfa.itemId,
        productId,
        supplier: { id: alfaId, name: "Alfa" },
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
      {
        supplierItemId: zeta.itemId,
        productId,
        supplier: { id: zetaId, name: "Zeta" },
        packaging: {
          name: "Bolsa x 10",
          quantityPerPackage: 10_000,
          active: true,
          saleUnit: "UNIT",
        },
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

    const offers = await latestSupplierOffers(db);

    expect(offers.map((offer) => offer.priceCents)).toEqual([300]);
  });

  it("tells whether the packaging of an offer is active and the sale unit it holds", async () => {
    const { id: productId } = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const supplierId = await insertSupplier(db, { actorId });
    const packagingId = await insertPackaging(db, {
      productId,
      actorId,
      name: "Caja vieja",
      saleUnit: "UNIT",
      active: false,
    });
    const itemId = await insertSupplierItem(db, { supplierId, productId, packagingId });
    await insertSupplierItemPrice(db, { itemId, listId: await confirmedList(supplierId) });

    const [offer] = await latestSupplierOffers(db);

    expect(offer?.packaging).toEqual({
      name: "Caja vieja",
      quantityPerPackage: 10_000,
      active: false,
      saleUnit: "UNIT",
    });
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

    expect(await latestSupplierOffers(db)).toEqual([]);
  });

  it("orders the items of one supplier by the name of their packaging", async () => {
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const supplierId = await insertSupplier(db, { actorId });
    const caja = await linkedItem(supplierId, productId, "Caja x 10");
    const bolsa = await linkedItem(supplierId, productId, "Bolsa x 10");
    for (const { itemId } of [caja, bolsa]) {
      await insertSupplierItemPrice(db, { itemId, listId: await confirmedList(supplierId) });
    }

    const offers = await latestSupplierOffers(db);

    expect(offers.map((offer) => offer.supplierItemId)).toEqual([bolsa.itemId, caja.itemId]);
  });

  it("answers only the offers of the products asked", async () => {
    const { id: yerbaId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const { id: harinaId } = await insertProduct(db, { name: "Harina 1 kg" });
    const supplierId = await insertSupplier(db, { actorId });
    const yerba = await linkedItem(supplierId, yerbaId);
    const harina = await linkedItem(supplierId, harinaId, "Bolsa x 10");
    for (const { itemId } of [yerba, harina]) {
      await insertSupplierItemPrice(db, { itemId, listId: await confirmedList(supplierId) });
    }

    const asked = await latestSupplierOffers(db, [yerbaId]);

    expect(asked.map((offer) => offer.supplierItemId)).toEqual([yerba.itemId]);
  });
});
