import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierItemLinkProposalReader } from "./drizzle-supplier-item-link-proposal-reader.js";
import { insertActor, insertBarcode, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;

const reader = () => new DrizzleSupplierItemLinkProposalReader(db);

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
  supplierId = await insertSupplier(db, { actorId });
});

describe("the row to propose a product for", () => {
  it("answers its description, presentation and barcode", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const [rowId] = await insertPriceListRows(db, listId, [
      { description: "Yerba 1 kg", presentation: "Caja x 10", barcode: "7790000000011" },
    ]);

    expect(await reader().row(listId, rowId as string)).toEqual({
      description: "Yerba 1 kg",
      presentation: "Caja x 10",
      barcode: "7790000000011",
    });
  });

  it("answers nothing for a row of another list or one that does not exist", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const otherListId = await insertPriceList(db, { supplierId, locationId, actorId });
    const [rowId] = await insertPriceListRows(db, listId, [{}]);

    expect(await reader().row(otherListId, rowId as string)).toBeUndefined();
    expect(await reader().row(listId, "00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("the active products carrying a barcode", () => {
  it("answers the active products with exactly that active barcode", async () => {
    const { id } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId: id, code: "7790000000011" });
    const { id: other } = await insertProduct(db, { name: "Azúcar 1 kg" });
    await insertBarcode(db, { productId: other, code: "7790000000028" });

    expect(await reader().activeProductsWithBarcode("7790000000011")).toEqual([
      { id, name: "Yerba 1 kg" },
    ]);
  });

  it("leaves out an inactive product, an inactive barcode and a barcode that only contains the digits", async () => {
    const { id: inactiveProduct } = await insertProduct(db, { name: "Yerba vieja", active: false });
    await insertBarcode(db, { productId: inactiveProduct, code: "7790000000011" });
    const { id: retiredBarcode } = await insertProduct(db, { name: "Yerba 500 g" });
    await insertBarcode(db, { productId: retiredBarcode, code: "7790000000011", active: false });
    const { id: longer } = await insertProduct(db, { name: "Yerba 2 kg" });
    await insertBarcode(db, { productId: longer, code: "77900000000119" });

    expect(await reader().activeProductsWithBarcode("7790000000011")).toEqual([]);
  });

  it("answers a product once however many barcodes it carries", async () => {
    const { id } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId: id, code: "7790000000011", position: 0 });
    await insertBarcode(db, { productId: id, code: "7790000000028", position: 1 });

    expect(await reader().activeProductsWithBarcode("7790000000028")).toEqual([
      { id, name: "Yerba 1 kg" },
    ]);
  });
});

describe("the active products", () => {
  it("answers the active products with their name", async () => {
    const { id } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertProduct(db, { name: "Producto retirado", active: false });

    expect(await reader().activeProducts()).toEqual([{ id, name: "Yerba 1 kg" }]);
  });
});
