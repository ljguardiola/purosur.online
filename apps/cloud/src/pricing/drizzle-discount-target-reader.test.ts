import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertBrand,
  insertProductWithTags,
  insertTag,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { categories } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleDiscountTargetReader } from "./drizzle-discount-target-reader.js";

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

describe("DrizzleDiscountTargetReader", () => {
  it("reads nothing from an empty catalog", async () => {
    const candidates = await new DrizzleDiscountTargetReader(db).targetCandidates();

    expect(candidates).toEqual({ products: [], categories: [], tags: [] });
  });

  it("reads every product by name, active or not, with its sale unit, brand and net content", async () => {
    const aurora = await insertBrand(db, { name: "Aurora" });
    const yerba = await insertProductWithTags(db, {
      name: "Yerba mate",
      tagIds: [],
      brandId: aurora.id,
      netContent: { quantity: 0.5, unit: "KG" },
    });
    const almonds = await insertProductWithTags(db, {
      name: "Almendras",
      tagIds: [],
      saleUnit: "KG",
    });
    const oil = await insertProductWithTags(db, {
      name: "Aceite de oliva",
      tagIds: [],
      active: false,
    });

    const { products } = await new DrizzleDiscountTargetReader(db).targetCandidates();

    expect(products).toEqual([
      {
        id: oil.id,
        name: "Aceite de oliva",
        active: false,
        saleUnit: "UNIT",
        brandName: null,
        netContent: null,
        barcodes: [],
      },
      {
        id: almonds.id,
        name: "Almendras",
        active: true,
        saleUnit: "KG",
        brandName: null,
        netContent: null,
        barcodes: [],
      },
      {
        id: yerba.id,
        name: "Yerba mate",
        active: true,
        saleUnit: "UNIT",
        brandName: "Aurora",
        netContent: { quantity: 0.5, unit: "KG" },
        barcodes: [],
      },
    ]);
  });

  it("reads each product's active barcodes in their position order", async () => {
    await insertProductWithTags(db, {
      name: "Yerba mate",
      tagIds: [],
      barcodes: [{ code: "7790002" }, { code: "7790009", active: false }, { code: "7790001" }],
    });

    const { products } = await new DrizzleDiscountTargetReader(db).targetCandidates();

    expect(products[0]?.barcodes).toEqual(["7790002", "7790001"]);
  });

  it("reads every category by name with its parent", async () => {
    const [almacen] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    const [jams] = await db
      .insert(categories)
      .values({ name: "Mermeladas", parentId: almacen?.id ?? "" })
      .returning({ id: categories.id });

    const { categories: listed } = await new DrizzleDiscountTargetReader(db).targetCandidates();

    expect(listed).toEqual([
      { id: almacen?.id, name: "Almacén", parentId: null },
      { id: jams?.id, name: "Mermeladas", parentId: almacen?.id },
    ]);
  });

  it("reads every tag by name, active or not", async () => {
    const vegano = await insertTag(db, { name: "Vegano" });
    const artesanal = await insertTag(db, { name: "Artesanal", active: false });

    const { tags } = await new DrizzleDiscountTargetReader(db).targetCandidates();

    expect(tags).toEqual([
      { id: artesanal.id, name: "Artesanal", active: false },
      { id: vegano.id, name: "Vegano", active: true },
    ]);
  });
});
