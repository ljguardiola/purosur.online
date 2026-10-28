import { createProductFromSupplierItem } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  brands,
  categories,
  changes,
  productBarcodes,
  productPackagings,
  products,
  productTags,
  tags,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSupplierItemProductStore } from "./drizzle-supplier-item-product-store.js";
import {
  extractedListWithRow,
  storedListRow,
  storedListVersion,
} from "./test-support/extracted-list-fixtures.js";
import {
  insertBarcode,
  insertLeafCategory,
  insertPackaging,
  insertProduct,
} from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

const store = () => new DrizzleSupplierItemProductStore(db, () => NOW);

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

const leafCategory = () => insertLeafCategory(db);

async function catalogRowCounts() {
  return {
    products: (await db.select().from(products)).length,
    barcodes: (await db.select().from(productBarcodes)).length,
    packagings: (await db.select().from(productPackagings)).length,
    changes: (await db.select().from(changes)).length,
  };
}

function newProduct(categoryId: string, barcodes: string[] = ["7790000000001"]) {
  return {
    name: "Yerba 1 kg",
    categoryId,
    brandId: null,
    saleUnit: "UNIT" as const,
    barcodes,
    tagIds: [],
    netContent: null,
  };
}

describe("lockRow", () => {
  it("answers the row with its description, code, presentation and no link when nothing is linked", async () => {
    const { listId, rowId } = await extractedListWithRow(
      db,
      {},
      {
        description: "Yerba 1 kg",
        code: "Y1",
        presentation: "Caja x 10",
      },
    );

    const result = await store().transaction((tx) => tx.lockRow(listId, rowId));

    expect(result).toEqual({
      kind: "locked",
      row: { description: "Yerba 1 kg", code: "Y1", presentation: "Caja x 10", link: null },
    });
  });

  it("answers the row's current link", async () => {
    const target = await insertProduct(db, { name: "Yerba" });
    const { listId, rowId, actorId } = await extractedListWithRow(db);
    const packagingId = await insertPackaging(db, { productId: target.id, actorId });
    await store().transaction(async (tx) => {
      await tx.linkRow(
        listId,
        rowId,
        { productId: target.id, packagingId, vatRate: 2_100 },
        actorId,
      );
    });

    const result = await store().transaction((tx) => tx.lockRow(listId, rowId));

    expect(result).toMatchObject({
      kind: "locked",
      row: { link: { productId: target.id, packagingId, vatRate: 2_100 } },
    });
  });

  it("answers not_found for a row that is not in that list", async () => {
    const { listId } = await extractedListWithRow(db);

    const result = await store().transaction((tx) => tx.lockRow(listId, MISSING_ID));

    expect(result).toEqual({ kind: "not_found" });
  });
});

describe("createCatalogProduct", () => {
  it("creates the product with its name, sale unit, category and barcodes, with no brand or tags", async () => {
    const categoryId = await leafCategory();

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct({ ...newProduct(categoryId, ["7791234567890"]), saleUnit: "KG" }),
    );

    if (outcome.kind !== "created") {
      throw new Error(`expected the product to be created, got ${outcome.kind}`);
    }
    const [product] = await db.select().from(products).where(eq(products.id, outcome.productId));
    expect(product).toMatchObject({
      name: "Yerba 1 kg",
      categoryId,
      saleUnit: "KG",
      brandId: null,
      active: true,
    });
    const barcodes = await db
      .select()
      .from(productBarcodes)
      .where(eq(productBarcodes.productId, outcome.productId));
    expect(barcodes.map((barcode) => barcode.code)).toEqual(["7791234567890"]);
  });

  it("creates the product with the brand, tags and net content given", async () => {
    const categoryId = await leafCategory();
    const [brand] = await db.insert(brands).values({ name: "Dulcor" }).returning();
    const [tag] = await db.insert(tags).values({ name: "Vegano" }).returning();
    if (!brand || !tag) {
      throw new Error("test setup: seeding the brand and the tag returned no row");
    }

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct({
        ...newProduct(categoryId),
        brandId: brand.id,
        tagIds: [tag.id],
        netContent: { quantity: 125, unit: "ML" },
      }),
    );

    if (outcome.kind !== "created") {
      throw new Error(`expected the product to be created, got ${outcome.kind}`);
    }
    const [product] = await db.select().from(products).where(eq(products.id, outcome.productId));
    expect(product).toMatchObject({
      brandId: brand.id,
      netContentQuantity: "125",
      netContentUnit: "ML",
    });
    const tagged = await db
      .select()
      .from(productTags)
      .where(eq(productTags.productId, outcome.productId));
    expect(tagged.map((row) => row.tagId)).toEqual([tag.id]);
  });

  it("answers brand_not_found for a brand that does not exist", async () => {
    const categoryId = await leafCategory();

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct({ ...newProduct(categoryId), brandId: MISSING_ID }),
    );

    expect(outcome).toEqual({ kind: "brand_not_found" });
    expect(await catalogRowCounts()).toMatchObject({ products: 0 });
  });

  it("answers brand_inactive for a deactivated brand", async () => {
    const categoryId = await leafCategory();
    const [brand] = await db.insert(brands).values({ name: "Dulcor", active: false }).returning();

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct({ ...newProduct(categoryId), brandId: brand?.id ?? MISSING_ID }),
    );

    expect(outcome).toEqual({ kind: "brand_inactive" });
    expect(await catalogRowCounts()).toMatchObject({ products: 0 });
  });

  it("answers tag_not_found for a tag that does not exist", async () => {
    const categoryId = await leafCategory();

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct({ ...newProduct(categoryId), tagIds: [MISSING_ID] }),
    );

    expect(outcome).toEqual({ kind: "tag_not_found" });
    expect(await catalogRowCounts()).toMatchObject({ products: 0 });
  });

  it("answers tag_inactive naming a deactivated tag", async () => {
    const categoryId = await leafCategory();
    const [tag] = await db.insert(tags).values({ name: "Vegano", active: false }).returning();

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct({ ...newProduct(categoryId), tagIds: [tag?.id ?? MISSING_ID] }),
    );

    expect(outcome).toEqual({ kind: "tag_inactive", tagId: tag?.id });
    expect(await catalogRowCounts()).toMatchObject({ products: 0 });
  });

  it("logs the new product for synchronization", async () => {
    const categoryId = await leafCategory();

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct(newProduct(categoryId)),
    );

    if (outcome.kind !== "created") {
      throw new Error(`expected the product to be created, got ${outcome.kind}`);
    }
    const logged = await db.select().from(changes).where(eq(changes.entityId, outcome.productId));
    expect(logged).toMatchObject([{ entity: "product", op: "insert" }]);
  });

  it("answers category_not_found for a category that does not exist", async () => {
    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct(newProduct(MISSING_ID)),
    );

    expect(outcome).toEqual({ kind: "category_not_found" });
    expect(await catalogRowCounts()).toMatchObject({ products: 0 });
  });

  it("answers category_not_leaf for a category that has subcategories", async () => {
    const parentId = await leafCategory();
    await db.insert(categories).values({ name: "Hijo", parentId });

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct(newProduct(parentId)),
    );

    expect(outcome).toEqual({ kind: "category_not_leaf" });
    expect(await catalogRowCounts()).toMatchObject({ products: 0 });
  });

  it("answers barcode_taken with the codes another active product carries", async () => {
    const categoryId = await leafCategory();
    const holder = await insertProduct(db, { name: "Otra yerba" });
    await insertBarcode(db, { productId: holder.id, code: "7791234567890" });

    const outcome = await store().transaction((tx) =>
      tx.createCatalogProduct(newProduct(categoryId, ["7791234567890", "7790000000001"])),
    );

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["7791234567890"] });
    expect((await catalogRowCounts()).products).toBe(1);
  });
});

describe("a product creation that fails after the product was inserted", () => {
  it("leaves no product, barcode, packaging or change behind", async () => {
    const categoryId = await leafCategory();
    const { actorId } = await extractedListWithRow(db);
    const before = await catalogRowCounts();

    await expect(
      store().transaction(async (tx) => {
        const created = await tx.createCatalogProduct(newProduct(categoryId, ["7791234567890"]));
        if (created.kind !== "created") {
          throw new Error("test setup: expected the product to be created");
        }
        await tx.insertPackaging({
          productId: created.productId,
          name: "Paquete",
          quantityPerPackage: 1,
          saleUnit: "UNIT",
          actorId,
        });
        throw new Error("the operation failed after the packaging");
      }),
    ).rejects.toThrow("the operation failed after the packaging");

    expect(await catalogRowCounts()).toEqual(before);
  });

  it("leaves the row unlinked and the list's version unchanged when linking the row fails", async () => {
    const categoryId = await leafCategory();
    const { listId, rowId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba" });

    await expect(
      store().transaction(async (tx) => {
        const created = await tx.createCatalogProduct(newProduct(categoryId));
        if (created.kind !== "created") {
          throw new Error("test setup: expected the product to be created");
        }
        await tx.linkRow(
          listId,
          rowId,
          { productId: created.productId, packagingId: MISSING_ID, vatRate: null },
          actorId,
        );
      }),
    ).rejects.toThrow();

    expect((await storedListRow(db, rowId))?.productId).toBeNull();
    expect(await storedListVersion(db, listId)).toBe(1);
    expect((await catalogRowCounts()).products).toBe(0);
  });
});

describe("creating a product from a supplier item through the use case", () => {
  it("creates the product, its packaging and the link together", async () => {
    const categoryId = await leafCategory();
    const { listId, rowId, actorId } = await extractedListWithRow(db, {}, { description: "Yerba" });

    const outcome = await createProductFromSupplierItem(store(), {
      listId,
      rowId,
      version: 1,
      name: "Yerba",
      saleUnit: "UNIT",
      categoryId,
      brandId: null,
      barcodes: ["7790000000001"],
      tagIds: [],
      netContent: null,
      packagingName: "Caja x 10",
      quantityPerPackage: 10_000,
      vatRate: 2_100,
      actorId,
    });

    if (outcome.kind !== "created") {
      throw new Error(`expected the product to be created, got ${outcome.kind}`);
    }
    expect(await storedListRow(db, rowId)).toMatchObject({
      productId: outcome.productId,
      packagingId: outcome.packagingId,
      vatRate: 2_100,
      reviewed: true,
    });
    const [packaging] = await db
      .select()
      .from(productPackagings)
      .where(eq(productPackagings.id, outcome.packagingId));
    expect(packaging).toMatchObject({ productId: outcome.productId, name: "Caja x 10" });
  });
});
