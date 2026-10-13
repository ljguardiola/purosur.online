import type { RecipeListing, RecipeListReader } from "./recipe-list-reader.js";

export async function listRecipes(reader: RecipeListReader): Promise<RecipeListing[]> {
  return reader.recipes();
}

export async function findRecipeListing(
  reader: RecipeListReader,
  productId: string,
): Promise<RecipeListing | undefined> {
  return reader.recipe(productId);
}
