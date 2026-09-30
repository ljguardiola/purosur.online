import {
  createCategory,
  createProduct,
  deactivateProduct,
  editCategory,
  editProduct,
} from "@purosur/domain/catalog/use-cases";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

const store = () => new DrizzleCatalogStore(db);

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

async function loggedChanges() {
  const rows = await db
    .select({
      entity: changes.entity,
      entityId: changes.entityId,
      version: changes.version,
      op: changes.op,
      priceListId: changes.priceListId,
    })
    .from(changes)
    .orderBy(asc(changes.changeSeq));
  return rows.filter((row) => row.entity === "category" || row.entity === "product");
}

async function newCategory(name = "Almacén", parentId: string | null = null) {
  const outcome = await createCategory(store(), { name, parentId });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the category ended as ${outcome.kind}`);
  }
  return outcome.category;
}

async function newProduct(categoryId: string, barcodes = ["7790001000011", "7790001000028"]) {
  const outcome = await createProduct(store(), {
    name: "Arroz",
    categoryId,
    brandId: null,
    saleUnit: "UNIT",
    barcodes,
    netContent: null,
  });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the product ended as ${outcome.kind}`);
  }
  return outcome.product;
}

describe("the catalog changes a pull hands to the registers", () => {
  it("logs a created category as an insert of its first version", async () => {
    const category = await newCategory();

    expect(await loggedChanges()).toEqual([
      { entity: "category", entityId: category.id, version: 1, op: "insert", priceListId: null },
    ]);
  });

  it("logs an edited category as an update of its next version", async () => {
    const category = await newCategory();

    await editCategory(store(), {
      id: category.id,
      name: "Almacén y secos",
      parentId: null,
      version: category.version,
    });

    expect((await loggedChanges()).slice(1)).toEqual([
      { entity: "category", entityId: category.id, version: 2, op: "update", priceListId: null },
    ]);
  });

  it("logs a created product once, as an insert of its first version, however many barcodes it has", async () => {
    const category = await newCategory();
    const product = await newProduct(category.id);

    expect((await loggedChanges()).slice(1)).toEqual([
      { entity: "product", entityId: product.id, version: 1, op: "insert", priceListId: null },
    ]);
  });

  it("logs an edited product once, as an update of its next version, even when only its barcodes changed", async () => {
    const category = await newCategory();
    const product = await newProduct(category.id);

    await editProduct(store(), {
      id: product.id,
      name: product.name,
      categoryId: category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
      version: product.version,
    });

    expect((await loggedChanges()).slice(2)).toEqual([
      { entity: "product", entityId: product.id, version: 2, op: "update", priceListId: null },
    ]);
  });

  it("logs a deactivated product as an update of its next version", async () => {
    const category = await newCategory();
    const product = await newProduct(category.id);

    await deactivateProduct(store(), product.id);

    expect((await loggedChanges()).slice(2)).toEqual([
      { entity: "product", entityId: product.id, version: 2, op: "update", priceListId: null },
    ]);
  });

  it("logs nothing when the operation is refused", async () => {
    const category = await newCategory();
    const product = await newProduct(category.id);
    const logged = await loggedChanges();

    const refusedEdit = await editProduct(store(), {
      id: product.id,
      name: "Otro",
      categoryId: category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
      version: product.version + 1,
    });
    const refusedCreation = await createProduct(store(), {
      name: "Fideos",
      categoryId: category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
    });
    const refusedCategory = await createCategory(store(), { name: "Almacén", parentId: null });

    expect([refusedEdit.kind, refusedCreation.kind, refusedCategory.kind]).toEqual([
      "stale_version",
      "barcode_taken",
      "name_taken",
    ]);
    expect(await loggedChanges()).toEqual(logged);
  });
});
