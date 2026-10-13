import { describe, expect, it } from "vitest";
import { findRecipeListing, listRecipes } from "./list-recipes.js";
import type { RecipeListing } from "./recipe-list-reader.js";
import { FakeRecipeListReader } from "./test-support/fake-recipe-list-reader.js";

const NUTS = {
  componentProductId: "nuts",
  name: "Nueces",
  saleUnit: "KG",
  quantityPerOutputUnit: 600,
} as const;
const BAG = {
  componentProductId: "bag",
  name: "Bolsa",
  saleUnit: "UNIT",
  quantityPerOutputUnit: 1_000,
} as const;

const MIX: RecipeListing = {
  productId: "mix",
  productName: "Mix de frutos secos",
  categoryName: "Mezclas",
  saleUnit: "KG",
  version: 2,
  components: [NUTS, BAG],
};
const GRANOLA: RecipeListing = {
  ...MIX,
  productId: "granola",
  productName: "Granola",
  version: 1,
  components: [NUTS],
};

describe("listRecipes", () => {
  it("answers every recipe with its product and components, ordered by product name", async () => {
    const reader = new FakeRecipeListReader([MIX, GRANOLA]);

    expect(await listRecipes(reader)).toEqual([GRANOLA, MIX]);
  });

  it("answers nothing when no product has a recipe", async () => {
    expect(await listRecipes(new FakeRecipeListReader())).toEqual([]);
  });
});

describe("findRecipeListing", () => {
  it("answers the recipe of a product", async () => {
    expect(await findRecipeListing(new FakeRecipeListReader([MIX, GRANOLA]), "mix")).toEqual(MIX);
  });

  it("answers undefined for a product without a recipe", async () => {
    expect(await findRecipeListing(new FakeRecipeListReader([MIX]), "granola")).toBeUndefined();
  });
});
