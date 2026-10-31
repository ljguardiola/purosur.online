import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { loadedSupplierPricesOf } from "./loaded-supplier-prices.js";
import { insertLoadedSupplierPrice } from "./test-support/loaded-supplier-price-fixtures.js";
import { insertProduct, signedInWith } from "./test-support/stock-route-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  ({ userId: actorId } = await signedInWith(db, [], new Date()));
});

describe("loadedSupplierPricesOf", () => {
  it("answers each product asked with its loaded prices, priced per sale unit", async () => {
    const { productId: yerbaId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const { productId: harinaId } = await insertProduct(db, { name: "Harina 1 kg" });
    const { productId: azucarId } = await insertProduct(db, { name: "Azúcar 1 kg" });
    const yerba = await insertLoadedSupplierPrice(db, {
      productId: yerbaId,
      actorId,
      supplierName: "Distribuidora Sur",
      priceCents: 1_000,
      quantity: 3_000,
      listDate: "2026-03-01",
    });
    const harina = await insertLoadedSupplierPrice(db, {
      productId: harinaId,
      actorId,
      supplierName: "Molinos del Norte",
      priceCents: 1_000,
      pricesIncludeVat: false,
      vatRate: 2_100,
      listDate: "2026-02-15",
    });

    const prices = await loadedSupplierPricesOf(db, [yerbaId, harinaId, azucarId]);

    expect(prices).toEqual(
      new Map([
        [
          yerbaId,
          [
            {
              supplierItemId: yerba.supplierItemId,
              supplierName: "Distribuidora Sur",
              quantity: 3_000,
              saleUnit: "UNIT",
              listDate: "2026-03-01",
              pricePerSaleUnit: { numerator: 1_000n, denominator: 3n },
            },
          ],
        ],
        [
          harinaId,
          [
            {
              supplierItemId: harina.supplierItemId,
              supplierName: "Molinos del Norte",
              quantity: 1_000,
              saleUnit: "UNIT",
              listDate: "2026-02-15",
              pricePerSaleUnit: { numerator: 1_210n, denominator: 1n },
            },
          ],
        ],
      ]),
    );
  });

  it("leaves out an offer that has no price per the product's own sale unit", async () => {
    const { productId } = await insertProduct(db, { saleUnit: "KG" });
    await insertLoadedSupplierPrice(db, {
      productId,
      actorId,
      priceCents: 1_000,
      linkSaleUnit: "UNIT",
    });
    const { supplierItemId } = await insertLoadedSupplierPrice(db, {
      productId,
      actorId,
      priceCents: 1_000,
      linkSaleUnit: "KG",
    });

    const prices = await loadedSupplierPricesOf(db, [productId]);

    expect(prices.get(productId)?.map((price) => price.supplierItemId)).toEqual([supplierItemId]);
  });
});
