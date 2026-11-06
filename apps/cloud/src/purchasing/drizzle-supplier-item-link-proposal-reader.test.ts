import type { ProductActivityScope } from "@purosur/domain/catalog/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBrand } from "../catalog/test-support/catalog-route-fixtures.js";
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
      otherPresentations: [],
    });
  });

  it("answers the presentations the other rows of the list state for the same description, without repeats", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const [rowId] = await insertPriceListRows(db, listId, [
      { description: "Aceite de palta 250 ml", presentation: "x3 packs" },
      { description: "Aceite de palta 250 ml", presentation: "Pack x12u" },
      { description: "Aceite de palta 250 ml", presentation: "Pack x12u" },
      { description: "Aceite de palta 250 ml", presentation: null },
      { description: "Aceite de palta 250 ml", presentation: "Caja" },
      { description: "Aceite de palta 500 ml", presentation: "Botella" },
    ]);

    const row = await reader().row(listId, rowId as string);

    expect([...(row?.otherPresentations ?? [])].sort()).toEqual(["Caja", "Pack x12u"]);
  });

  it("leaves out the presentations of the same description in another list", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const otherListId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const [rowId] = await insertPriceListRows(db, listId, [
      { description: "Aceite de palta 250 ml", presentation: "x3 packs" },
    ]);
    await insertPriceListRows(db, otherListId, [
      { description: "Aceite de palta 250 ml", presentation: "Pack x12u" },
    ]);

    expect((await reader().row(listId, rowId as string))?.otherPresentations).toEqual([]);
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

describe("the products of a scope carrying a barcode", () => {
  it("answers the active products with exactly that active barcode", async () => {
    const { id } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId: id, code: "7790000000011" });
    const { id: other } = await insertProduct(db, { name: "Azúcar 1 kg" });
    await insertBarcode(db, { productId: other, code: "7790000000028" });

    expect(await reader().productsWithBarcode("7790000000011", "active")).toEqual([
      { id, name: "Yerba 1 kg", brandName: null, netContent: null, saleUnit: "UNIT" },
    ]);
  });

  it("answers the brand's name and the net content of each product", async () => {
    const kos = await insertBrand(db, { name: "Kos" });
    const { id } = await insertProduct(db, {
      name: "Granola Berries",
      brandId: kos.id,
      netContent: { quantity: 1, unit: "KG" },
    });
    await insertBarcode(db, { productId: id, code: "7790000000011" });

    expect(await reader().productsWithBarcode("7790000000011", "active")).toEqual([
      {
        id,
        name: "Granola Berries",
        brandName: "Kos",
        netContent: { quantity: 1, unit: "KG" },
        saleUnit: "UNIT",
      },
    ]);
  });

  it("leaves out an inactive product, an inactive barcode and a barcode that only contains the digits", async () => {
    const { id: inactiveProduct } = await insertProduct(db, { name: "Yerba vieja", active: false });
    await insertBarcode(db, { productId: inactiveProduct, code: "7790000000011" });
    const { id: retiredBarcode } = await insertProduct(db, { name: "Yerba 500 g" });
    await insertBarcode(db, { productId: retiredBarcode, code: "7790000000011", active: false });
    const { id: longer } = await insertProduct(db, { name: "Yerba 2 kg" });
    await insertBarcode(db, { productId: longer, code: "77900000000119" });

    expect(await reader().productsWithBarcode("7790000000011", "active")).toEqual([]);
  });

  it("answers the products of the scope asked for", async () => {
    const { id: active } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId: active, code: "7790000000011" });
    const { id: inactive } = await insertProduct(db, { name: "Yerba vieja", active: false });
    await insertBarcode(db, { productId: inactive, code: "7790000000028" });

    const ids = async (barcode: string, scope: ProductActivityScope) =>
      (await reader().productsWithBarcode(barcode, scope)).map(({ id }) => id);

    expect(await ids("7790000000011", "inactive")).toEqual([]);
    expect(await ids("7790000000028", "inactive")).toEqual([inactive]);
    expect(await ids("7790000000011", "any")).toEqual([active]);
    expect(await ids("7790000000028", "any")).toEqual([inactive]);
  });

  it("answers a product once however many barcodes it carries", async () => {
    const { id } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertBarcode(db, { productId: id, code: "7790000000011", position: 0 });
    await insertBarcode(db, { productId: id, code: "7790000000028", position: 1 });

    expect(await reader().productsWithBarcode("7790000000028", "active")).toEqual([
      { id, name: "Yerba 1 kg", brandName: null, netContent: null, saleUnit: "UNIT" },
    ]);
  });
});

describe("the products of a scope", () => {
  it("answers the active products with their name, brand name and net content", async () => {
    const kos = await insertBrand(db, { name: "Kos" });
    const { id } = await insertProduct(db, {
      name: "Granola Berries",
      brandId: kos.id,
      netContent: { quantity: 500, unit: "G" },
    });
    const { id: plain } = await insertProduct(db, { name: "Yerba 1 kg" });
    await insertProduct(db, { name: "Producto retirado", active: false });

    expect(await reader().products("active")).toEqual(
      expect.arrayContaining([
        {
          id,
          name: "Granola Berries",
          brandName: "Kos",
          netContent: { quantity: 500, unit: "G" },
          saleUnit: "UNIT",
        },
        { id: plain, name: "Yerba 1 kg", brandName: null, netContent: null, saleUnit: "UNIT" },
      ]),
    );
    expect(await reader().products("active")).toHaveLength(2);
  });

  it("answers the products of the scope asked for", async () => {
    const { id: active } = await insertProduct(db, { name: "Yerba 1 kg" });
    const { id: inactive } = await insertProduct(db, { name: "Producto retirado", active: false });

    const ids = async (scope: ProductActivityScope) =>
      (await reader().products(scope)).map(({ id }) => id);

    expect(await ids("inactive")).toEqual([inactive]);
    expect(await ids("any")).toHaveLength(2);
    expect(await ids("any")).toEqual(expect.arrayContaining([active, inactive]));
  });

  it("answers the sale unit of each product", async () => {
    const { id } = await insertProduct(db, { name: "Almendras peladas", saleUnit: "KG" });

    expect(await reader().products("active")).toEqual([
      { id, name: "Almendras peladas", brandName: null, netContent: null, saleUnit: "KG" },
    ]);
  });
});

describe("one product of a scope", () => {
  it("answers its name, brand name, net content and sale unit", async () => {
    const kos = await insertBrand(db, { name: "Kos" });
    const { id } = await insertProduct(db, {
      name: "Granola Berries",
      brandId: kos.id,
      netContent: { quantity: 500, unit: "G" },
      saleUnit: "KG",
    });
    await insertProduct(db, { name: "Yerba 1 kg" });

    expect(await reader().product(id, "active")).toEqual({
      id,
      name: "Granola Berries",
      brandName: "Kos",
      netContent: { quantity: 500, unit: "G" },
      saleUnit: "KG",
    });
  });

  it("answers nothing for a product outside the scope or one that does not exist", async () => {
    const { id: active } = await insertProduct(db, { name: "Yerba 1 kg" });
    const { id: inactive } = await insertProduct(db, { name: "Producto retirado", active: false });

    expect(await reader().product(inactive, "active")).toBeUndefined();
    expect(await reader().product(active, "inactive")).toBeUndefined();
    expect(await reader().product(inactive, "any")).toMatchObject({ id: inactive });
    expect(await reader().product("00000000-0000-4000-8000-000000000000", "any")).toBeUndefined();
  });
});
