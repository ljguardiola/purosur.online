import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  brands,
  categories,
  productBarcodes,
  products,
  productTags,
  tags,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleCatalogListReader } from "./drizzle-catalog-list-reader.js";

function readerOn(database: TestDatabase["db"]) {
  return new DrizzleCatalogListReader(database);
}

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let reader: ReturnType<typeof readerOn>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  reader = readerOn(db);
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function insertCategory(name = "Almacén", parentId?: string): Promise<string> {
  const [row] = await db
    .insert(categories)
    .values({ name, parentId })
    .returning({ id: categories.id });
  if (!row) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return row.id;
}

async function insertBrand(name: string, active = true): Promise<string> {
  const [row] = await db.insert(brands).values({ name, active }).returning({ id: brands.id });
  if (!row) {
    throw new Error("test setup: seeding the brand returned no row");
  }
  return row.id;
}

async function insertTag(name: string, active = true): Promise<string> {
  const [row] = await db.insert(tags).values({ name, active }).returning({ id: tags.id });
  if (!row) {
    throw new Error("test setup: seeding the tag returned no row");
  }
  return row.id;
}

async function insertProduct(input: {
  name: string;
  categoryId: string;
  active?: boolean;
  brandId?: string;
  tagIds?: string[];
  barcodes?: string[];
}): Promise<string> {
  const [row] = await db
    .insert(products)
    .values({
      name: input.name,
      categoryId: input.categoryId,
      brandId: input.brandId,
      saleUnit: "UNIT",
      active: input.active ?? true,
    })
    .returning({ id: products.id });
  if (!row) {
    throw new Error("test setup: seeding the product returned no row");
  }
  const tagIds = input.tagIds ?? [];
  if (tagIds.length > 0) {
    await db.insert(productTags).values(tagIds.map((tagId) => ({ productId: row.id, tagId })));
  }
  const barcodes = input.barcodes ?? [];
  if (barcodes.length > 0) {
    await db
      .insert(productBarcodes)
      .values(barcodes.map((code, position) => ({ productId: row.id, code, position })));
  }
  return row.id;
}

describe("DrizzleCatalogListReader", () => {
  describe("products", () => {
    it("answers only the products in the requested activity scope, by name", async () => {
      const categoryId = await insertCategory();
      const honey = await insertProduct({ name: "Miel", categoryId });
      const almonds = await insertProduct({ name: "Almendras", categoryId });
      const retired = await insertProduct({ name: "Harina", categoryId, active: false });

      const names = async (scope: "active" | "inactive" | "any") =>
        (await reader.products(scope)).map((product) => product.id);

      expect(await names("active")).toEqual([almonds, honey]);
      expect(await names("inactive")).toEqual([retired]);
      expect(await names("any")).toEqual([almonds, retired, honey]);
    });

    it("answers each product with its category, brand, barcodes by position and tag ids by tag name", async () => {
      const categoryId = await insertCategory("Almacén");
      const brandId = await insertBrand("Granix");
      const vegan = await insertTag("Vegano");
      const organic = await insertTag("Organico");
      const productId = await insertProduct({
        name: "Miel",
        categoryId,
        brandId,
        tagIds: [vegan, organic],
        barcodes: ["111", "222"],
      });

      const [product] = await reader.products("active");

      expect(product).toEqual({
        id: productId,
        name: "Miel",
        categoryId,
        categoryName: "Almacén",
        brandId,
        saleUnit: "UNIT",
        barcodes: ["111", "222"],
        tagIds: [organic, vegan],
        netContent: null,
        active: true,
        version: 1,
      });
    });

    it("answers nothing when the catalog has no product", async () => {
      expect(await reader.products("any")).toEqual([]);
    });
  });

  describe("categories", () => {
    it("answers every category by name with its parent", async () => {
      const grocery = await insertCategory("Almacén");
      const cereals = await insertCategory("Cereales", grocery);

      expect(await reader.categories()).toEqual([
        { id: grocery, name: "Almacén", version: 1, parentId: null },
        { id: cereals, name: "Cereales", version: 1, parentId: grocery },
      ]);
    });
  });

  describe("brands", () => {
    it("answers every brand by name, deactivated ones included, counting the products in the requested scope", async () => {
      const categoryId = await insertCategory();
      const granix = await insertBrand("Granix");
      const litoral = await insertBrand("Litoral", false);
      await insertProduct({ name: "Miel", categoryId, brandId: granix });
      await insertProduct({ name: "Avena", categoryId, brandId: granix });
      await insertProduct({ name: "Harina", categoryId, brandId: granix, active: false });

      const counts = async (scope: "active" | "inactive" | "any") =>
        (await reader.brands(scope)).map(({ name, productCount }) => [name, productCount]);

      expect(await counts("active")).toEqual([
        ["Granix", 2],
        ["Litoral", 0],
      ]);
      expect(await counts("inactive")).toEqual([
        ["Granix", 1],
        ["Litoral", 0],
      ]);
      expect(await counts("any")).toEqual([
        ["Granix", 3],
        ["Litoral", 0],
      ]);
      expect(await reader.brands("active")).toEqual([
        { id: granix, name: "Granix", active: true, version: 1, productCount: 2 },
        { id: litoral, name: "Litoral", active: false, version: 1, productCount: 0 },
      ]);
    });

    it("answers one brand with its count", async () => {
      const categoryId = await insertCategory();
      const granix = await insertBrand("Granix");
      await insertBrand("Litoral");
      await insertProduct({ name: "Miel", categoryId, brandId: granix });
      await insertProduct({ name: "Harina", categoryId, brandId: granix, active: false });

      expect(await reader.brand(granix, "active")).toEqual({
        id: granix,
        name: "Granix",
        active: true,
        version: 1,
        productCount: 1,
      });
    });

    it("answers nothing for a brand that does not exist or an id that is not a uuid", async () => {
      expect(await reader.brand("00000000-0000-0000-0000-000000000000", "active")).toBeUndefined();
      expect(await reader.brand("not-a-uuid", "active")).toBeUndefined();
    });
  });

  describe("tags", () => {
    it("answers every tag by name, deactivated ones included, counting the products in the requested scope", async () => {
      const categoryId = await insertCategory();
      const organic = await insertTag("Organico");
      const vegan = await insertTag("Vegano", false);
      await insertProduct({ name: "Miel", categoryId, tagIds: [organic, vegan] });
      await insertProduct({ name: "Harina", categoryId, tagIds: [organic], active: false });

      const counts = async (scope: "active" | "inactive" | "any") =>
        (await reader.tags(scope)).map(({ name, productCount }) => [name, productCount]);

      expect(await counts("active")).toEqual([
        ["Organico", 1],
        ["Vegano", 1],
      ]);
      expect(await counts("inactive")).toEqual([
        ["Organico", 1],
        ["Vegano", 0],
      ]);
      expect(await counts("any")).toEqual([
        ["Organico", 2],
        ["Vegano", 1],
      ]);
      expect(await reader.tags("active")).toEqual([
        { id: organic, name: "Organico", active: true, version: 1, productCount: 1 },
        { id: vegan, name: "Vegano", active: false, version: 1, productCount: 1 },
      ]);
    });

    it("answers one tag with its count", async () => {
      const categoryId = await insertCategory();
      const organic = await insertTag("Organico");
      await insertTag("Vegano");
      await insertProduct({ name: "Miel", categoryId, tagIds: [organic] });
      await insertProduct({ name: "Harina", categoryId, tagIds: [organic], active: false });

      expect(await reader.tag(organic, "active")).toEqual({
        id: organic,
        name: "Organico",
        active: true,
        version: 1,
        productCount: 1,
      });
    });

    it("answers nothing for a tag that does not exist or an id that is not a uuid", async () => {
      expect(await reader.tag("00000000-0000-0000-0000-000000000000", "active")).toBeUndefined();
      expect(await reader.tag("not-a-uuid", "active")).toBeUndefined();
    });

    it("counts each tagged product once however many tags it has, within the requested scope", async () => {
      const categoryId = await insertCategory();
      const organic = await insertTag("Organico");
      const vegan = await insertTag("Vegano");
      await insertProduct({ name: "Miel", categoryId, tagIds: [organic, vegan] });
      await insertProduct({ name: "Avena", categoryId });
      await insertProduct({ name: "Harina", categoryId, tagIds: [organic], active: false });

      expect(await reader.taggedProductCount("active")).toBe(1);
      expect(await reader.taggedProductCount("inactive")).toBe(1);
      expect(await reader.taggedProductCount("any")).toBe(2);
    });

    it("counts no tagged product when none is tagged", async () => {
      expect(await reader.taggedProductCount("any")).toBe(0);
    });
  });
});
