import type { fetchRecipes } from "../recipes-api";
import { useRecipesQuery } from "../stock-queries";

export function RecipesReader({ read }: { read: typeof fetchRecipes }) {
  useRecipesQuery({ fetchRecipes: read, onSessionEnded: () => {} });
  return null;
}
