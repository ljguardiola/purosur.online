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
  lastBatch: {
    unitCostCents: 3_586,
    costIncomplete: false,
    assembledAt: new Date("2026-05-04T13:00:00.000Z"),
  },
  components: [NUTS, BAG],
};
const GRANOLA: RecipeListing = {
  ...MIX,
  productId: "granola",
  productName: "Granola",
  version: 1,
  lastBatch: null,
  components: [NUTS],
};

describe("listRecipes", () => {
  it("answers every recipe with its product and components, ordered by product name", async () => {
    const reader = new FakeRecipeListReader([MIX, GRANOLA]);

    expect(await listRecipes(reader, "branch-1")).toEqual([GRANOLA, MIX]);
  });

  it("asks for the last batch of each recipe at the location", async () => {
    const reader = new FakeRecipeListReader([MIX]);

    await listRecipes(reader, "branch-1");
    await findRecipeListing(reader, "mix", "branch-2");

    expect(reader.locationsAsked).toEqual(["branch-1", "branch-2"]);
  });

  it("answers nothing when no product has a recipe", async () => {
    expect(await listRecipes(new FakeRecipeListReader(), "branch-1")).toEqual([]);
  });
});

describe("findRecipeListing", () => {
  it("answers the recipe of a product", async () => {
    expect(
      await findRecipeListing(new FakeRecipeListReader([MIX, GRANOLA]), "mix", "branch-1"),
    ).toEqual(MIX);
  });

  it("answers undefined for a product without a recipe", async () => {
    expect(
      await findRecipeListing(new FakeRecipeListReader([MIX]), "granola", "branch-1"),
    ).toBeUndefined();
  });
});
