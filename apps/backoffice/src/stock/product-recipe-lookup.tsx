import type { ProductRecipeLookupProps } from "../platform/product-panel-sections";
import { fetchRecipes } from "./recipes-api";
import { useRecipesQuery } from "./stock-queries";

export function useProductRecipeLookup({
  productId,
  enabled,
  onSessionEnded,
  fetchRecipes: fetchRecipesService = fetchRecipes,
}: {
  productId: string;
  enabled: boolean;
  onSessionEnded: () => void;
  fetchRecipes?: typeof fetchRecipes | undefined;
}): "assembled" | "simple" | "unknown" {
  const recipes = useRecipesQuery({ fetchRecipes: fetchRecipesService, onSessionEnded, enabled });
  if (recipes.status !== "loaded") {
    return "unknown";
  }
  return recipes.value.recipes.some((recipe) => recipe.productId === productId)
    ? "assembled"
    : "simple";
}

export function ProductRecipeLookup({
  children,
  ...params
}: ProductRecipeLookupProps & { fetchRecipes?: typeof fetchRecipes | undefined }) {
  return children(useProductRecipeLookup(params));
}
