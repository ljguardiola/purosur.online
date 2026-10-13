import { saveRecipe } from "@purosur/domain/stock/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRecipeListReader } from "./drizzle-recipe-list-reader.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import { insertProduct, signedInWith } from "./test-support/stock-route-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

const NOON = new Date("2026-09-16T15:00:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = (await signedInWith(db, [], NOON)).userId;
});

function save(productId: string, components: { id: string; quantity: number }[]) {
  return saveRecipe(new DrizzleRecipeStore(db, () => NOON), {
    productId,
    components: components.map(({ id, quantity }) => ({
      componentProductId: id,
      quantityPerOutputUnit: quantity,
    })),
    version: null,
    actorId,
  });
}

describe("DrizzleRecipeListReader", () => {
  it("lists nothing when no product has a recipe", async () => {
    await insertProduct(db, { name: "Nueces", saleUnit: "KG" });

    expect(await new DrizzleRecipeListReader(db).recipes()).toEqual([]);
  });

  it("lists each assembled product with its category, sale unit and version, ordered by name, with its components in the order saved", async () => {
    const mix = await insertProduct(db, {
      name: "Mix de frutos secos",
      categoryName: "Mezclas",
      saleUnit: "KG",
    });
    const granola = await insertProduct(db, {
      name: "Granola",
      categoryName: "Cereales",
      saleUnit: "UNIT",
    });
    const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
    const bag = await insertProduct(db, { name: "Bolsa", saleUnit: "UNIT" });
    await save(mix.productId, [
      { id: bag.productId, quantity: 1_000 },
      { id: nuts.productId, quantity: 600 },
    ]);
    await save(granola.productId, [{ id: nuts.productId, quantity: 250 }]);

    expect(await new DrizzleRecipeListReader(db).recipes()).toEqual([
      {
        productId: granola.productId,
        productName: "Granola",
        categoryName: "Cereales",
        saleUnit: "UNIT",
        version: 1,
        components: [
          {
            componentProductId: nuts.productId,
            name: "Nueces",
            saleUnit: "KG",
            quantityPerOutputUnit: 250,
          },
        ],
      },
      {
        productId: mix.productId,
        productName: "Mix de frutos secos",
        categoryName: "Mezclas",
        saleUnit: "KG",
        version: 1,
        components: [
          {
            componentProductId: bag.productId,
            name: "Bolsa",
            saleUnit: "UNIT",
            quantityPerOutputUnit: 1_000,
          },
          {
            componentProductId: nuts.productId,
            name: "Nueces",
            saleUnit: "KG",
            quantityPerOutputUnit: 600,
          },
        ],
      },
    ]);
  });

  it("finds the recipe of one product and answers undefined for a product without one", async () => {
    const mix = await insertProduct(db, { name: "Mix", saleUnit: "KG" });
    const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
    await save(mix.productId, [{ id: nuts.productId, quantity: 600 }]);
    const reader = new DrizzleRecipeListReader(db);

    expect(await reader.recipe(mix.productId)).toMatchObject({
      productId: mix.productId,
      components: [{ componentProductId: nuts.productId }],
    });
    expect(await reader.recipe(nuts.productId)).toBeUndefined();
  });
});
