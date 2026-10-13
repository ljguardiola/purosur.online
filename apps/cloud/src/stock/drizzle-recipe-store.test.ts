import { RecipeVersionConflict, saveRecipe } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recipeComponents, recipes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import { insertProduct, signedInWith } from "./test-support/stock-route-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

const FIRST_SAVE = new Date("2026-09-16T15:00:00.000Z");
const SECOND_SAVE = new Date("2026-09-17T15:00:00.000Z");
let now = FIRST_SAVE;

const store = () => new DrizzleRecipeStore(db, () => now);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  now = FIRST_SAVE;
  actorId = (await signedInWith(db, [], FIRST_SAVE)).userId;
});

async function fixtures() {
  const mix = await insertProduct(db, { name: "Mix de frutos secos", saleUnit: "KG" });
  const nuts = await insertProduct(db, { name: "Nueces", saleUnit: "KG" });
  const raisins = await insertProduct(db, { name: "Pasas", saleUnit: "KG" });
  const bag = await insertProduct(db, { name: "Bolsa", saleUnit: "UNIT" });
  return {
    mix: mix.productId,
    nuts: nuts.productId,
    raisins: raisins.productId,
    bag: bag.productId,
  };
}

async function storedComponents(productId: string) {
  return db
    .select({
      componentProductId: recipeComponents.componentProductId,
      quantityPerOutputUnit: recipeComponents.quantityPerOutputUnit,
    })
    .from(recipeComponents)
    .where(eq(recipeComponents.productId, productId))
    .orderBy(recipeComponents.position);
}

describe("DrizzleRecipeStore", () => {
  it("stores a first recipe at version 1 with its components in the order they were given, recording who saved it and when", async () => {
    const { mix, nuts, raisins } = await fixtures();
    const components = [
      { componentProductId: raisins, quantityPerOutputUnit: 400 },
      { componentProductId: nuts, quantityPerOutputUnit: 600 },
    ];

    const outcome = await saveRecipe(store(), {
      productId: mix,
      components,
      version: null,
      actorId,
    });

    expect(outcome).toEqual({ kind: "saved", recipe: { productId: mix, components, version: 1 } });
    expect(await db.select().from(recipes)).toEqual([
      { productId: mix, version: 1, actorId, updatedAt: FIRST_SAVE },
    ]);
    expect(await storedComponents(mix)).toEqual(components);
  });

  it("replaces a recipe entirely, bumping its version and recording the new writer and moment", async () => {
    const { mix, nuts, raisins, bag } = await fixtures();
    await saveRecipe(store(), {
      productId: mix,
      components: [
        { componentProductId: nuts, quantityPerOutputUnit: 600 },
        { componentProductId: raisins, quantityPerOutputUnit: 400 },
      ],
      version: null,
      actorId,
    });
    const editor = (await signedInWith(db, [], SECOND_SAVE)).userId;
    now = SECOND_SAVE;
    const replacement = [
      { componentProductId: bag, quantityPerOutputUnit: 1_000 },
      { componentProductId: nuts, quantityPerOutputUnit: 750 },
    ];

    const outcome = await saveRecipe(store(), {
      productId: mix,
      components: replacement,
      version: 1,
      actorId: editor,
    });

    expect(outcome).toEqual({
      kind: "saved",
      recipe: { productId: mix, components: replacement, version: 2 },
    });
    expect(await db.select().from(recipes)).toEqual([
      { productId: mix, version: 2, actorId: editor, updatedAt: SECOND_SAVE },
    ]);
    expect(await storedComponents(mix)).toEqual(replacement);
  });

  it("answers the product's sale unit and whether it is active when it locks it, and not_found for one that does not exist", async () => {
    const retired = await insertProduct(db, { name: "Retirado", saleUnit: "UNIT", active: false });

    const [locked, missing] = await store().transaction(async (tx) => [
      await tx.lockProduct(retired.productId),
      await tx.lockProduct("0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f"),
    ]);

    expect(locked).toEqual({
      kind: "locked",
      product: { id: retired.productId, saleUnit: "UNIT", active: false },
    });
    expect(missing).toEqual({ kind: "not_found" });
  });

  it("raises the domain's conflict when the first recipe of a product is inserted twice", async () => {
    const { mix, nuts } = await fixtures();
    const fields = {
      productId: mix,
      components: [{ componentProductId: nuts, quantityPerOutputUnit: 600 }],
      actorId,
    };
    await store().transaction((tx) => tx.insertRecipe(fields));

    await expect(store().transaction((tx) => tx.insertRecipe(fields))).rejects.toBeInstanceOf(
      RecipeVersionConflict,
    );
  });

  it("lets any other failure of a write through, leaving no recipe row behind", async () => {
    const { mix, nuts } = await fixtures();

    await expect(
      store().transaction((tx) =>
        tx.insertRecipe({
          productId: mix,
          components: [
            { componentProductId: nuts, quantityPerOutputUnit: 600 },
            { componentProductId: nuts, quantityPerOutputUnit: 100 },
          ],
          actorId,
        }),
      ),
    ).rejects.not.toBeInstanceOf(RecipeVersionConflict);
    expect(await db.select().from(recipes)).toEqual([]);
  });

  it("answers null as the version of a product without a recipe", async () => {
    const { mix } = await fixtures();

    expect(await store().transaction((tx) => tx.recipeVersion(mix))).toBeNull();
  });
});
