import type { RecipeListing, RecipeListReader } from "./recipe-list-reader.js";

export async function listRecipes(
  reader: RecipeListReader,
  locationId: string,
): Promise<RecipeListing[]> {
  return reader.recipes(locationId);
}

export async function findRecipeListing(
  reader: RecipeListReader,
  productId: string,
  locationId: string,
): Promise<RecipeListing | undefined> {
  return reader.recipe(productId, locationId);
}
