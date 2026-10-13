import { saveRecipe } from "@purosur/domain/stock/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRecipeListReader } from "./drizzle-recipe-list-reader.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import { insertAssemblyBatch } from "./test-support/assembly-batch-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;

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
  locationId = await seededLocationId(db);
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

    expect(await new DrizzleRecipeListReader(db).recipes(locationId)).toEqual([]);
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

    expect(await new DrizzleRecipeListReader(db).recipes(locationId)).toEqual([
      {
        productId: granola.productId,
        productName: "Granola",
        categoryName: "Cereales",
        saleUnit: "UNIT",
        version: 1,
        lastBatch: null,
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
        lastBatch: null,
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

    expect(await reader.recipe(mix.productId, locationId)).toMatchObject({
      productId: mix.productId,
      components: [{ componentProductId: nuts.productId }],
    });
    expect(await reader.recipe(nuts.productId, locationId)).toBeUndefined();
  });

  describe("the last batch", () => {
    async function mixWithRecipe() {
      const mix = await insertProduct(db, { name: "Mix", saleUnit: "KG" });
      const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
      await save(mix.productId, [{ id: nuts.productId, quantity: 600 }]);
      return mix.productId;
    }

    const lastBatchOf = async (productId: string, at = locationId) =>
      (await new DrizzleRecipeListReader(db).recipe(productId, at))?.lastBatch;

    it("is the most recent batch of the product at the location, with its unit cost rounded for showing", async () => {
      const productId = await mixWithRecipe();
      await insertAssemblyBatch(db, {
        productId,
        locationId,
        actorId,
        assembledAt: new Date("2026-05-04T13:00:00.000Z"),
        cost: { totalCents: 99_999, quantity: 14_000 },
      });
      await insertAssemblyBatch(db, {
        productId,
        locationId,
        actorId,
        assembledAt: new Date("2026-05-20T13:00:00.000Z"),
        cost: { totalCents: 50_200, quantity: 14_000 },
      });

      expect(await lastBatchOf(productId)).toEqual({
        unitCostCents: 3_586,
        costIncomplete: false,
        assembledAt: new Date("2026-05-20T13:00:00.000Z"),
      });
    });

    it("has no unit cost when the cost of the batch is incomplete", async () => {
      const productId = await mixWithRecipe();
      await insertAssemblyBatch(db, {
        productId,
        locationId,
        actorId,
        assembledAt: new Date("2026-05-04T13:00:00.000Z"),
        cost: { totalCents: 200, quantity: 14_000 },
        costIncomplete: true,
      });

      expect(await lastBatchOf(productId)).toEqual({
        unitCostCents: null,
        costIncomplete: true,
        assembledAt: new Date("2026-05-04T13:00:00.000Z"),
      });
    });

    it("ignores the batches made at another location, and is none for a recipe never made", async () => {
      const productId = await mixWithRecipe();
      const otherLocationId = await insertLocation(db);
      await insertAssemblyBatch(db, {
        productId,
        locationId: otherLocationId,
        actorId,
        assembledAt: new Date("2026-05-04T13:00:00.000Z"),
      });

      expect(await lastBatchOf(productId)).toBeNull();
      expect(await lastBatchOf(productId, otherLocationId)).not.toBeNull();
    });

    it("is listed with each recipe of the location", async () => {
      const productId = await mixWithRecipe();
      await insertAssemblyBatch(db, {
        productId,
        locationId,
        actorId,
        assembledAt: new Date("2026-05-04T13:00:00.000Z"),
      });

      const [listing] = await new DrizzleRecipeListReader(db).recipes(locationId);

      expect(listing?.lastBatch?.assembledAt).toEqual(new Date("2026-05-04T13:00:00.000Z"));
    });
  });
});
