import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, productBarcodes, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleLabelProductReader } from "./drizzle-label-product-reader.js";

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

async function insertProduct(input: {
  name: string;
  active?: boolean;
  barcodes: string[];
}): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Categoría de ${input.name}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({
      name: input.name,
      categoryId: category.id,
      saleUnit: "UNIT",
      active: input.active ?? true,
    })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  if (input.barcodes.length > 0) {
    await db.insert(productBarcodes).values(
      input.barcodes.map((code, position) => ({
        productId: product.id,
        code,
        position,
        active: input.active ?? true,
      })),
    );
  }
  return product.id;
}

describe("DrizzleLabelProductReader", () => {
  it("answers each requested product with its name, whether it is active and its barcodes by position", async () => {
    const honeyId = await insertProduct({
      name: "Miel pura de abeja 1 kg",
      barcodes: ["2000000000015", "7790001000011"],
    });
    const almondsId = await insertProduct({
      name: "Almendras peladas",
      active: false,
      barcodes: [],
    });

    const answered = await new DrizzleLabelProductReader(db).productsForLabels([
      honeyId,
      almondsId,
    ]);

    expect(answered).toHaveLength(2);
    expect(answered).toEqual(
      expect.arrayContaining([
        {
          id: honeyId,
          name: "Miel pura de abeja 1 kg",
          active: true,
          barcodes: ["2000000000015", "7790001000011"],
        },
        { id: almondsId, name: "Almendras peladas", active: false, barcodes: [] },
      ]),
    );
  });

  it("answers the barcodes in position order whatever order they were written in", async () => {
    const honeyId = await insertProduct({ name: "Miel", barcodes: [] });
    await db.insert(productBarcodes).values([
      { productId: honeyId, code: "333", position: 2 },
      { productId: honeyId, code: "111", position: 0 },
      { productId: honeyId, code: "222", position: 1 },
    ]);

    const [honey] = await new DrizzleLabelProductReader(db).productsForLabels([honeyId]);

    expect(honey?.barcodes).toEqual(["111", "222", "333"]);
  });

  it("answers only the requested products", async () => {
    const honeyId = await insertProduct({ name: "Miel", barcodes: ["111"] });
    await insertProduct({ name: "Almendras", barcodes: ["222"] });

    const answered = await new DrizzleLabelProductReader(db).productsForLabels([honeyId]);

    expect(answered.map((product) => product.id)).toEqual([honeyId]);
  });

  it("answers nothing for an id no product has", async () => {
    expect(
      await new DrizzleLabelProductReader(db).productsForLabels([
        "00000000-0000-0000-0000-000000000000",
      ]),
    ).toEqual([]);
  });
});
