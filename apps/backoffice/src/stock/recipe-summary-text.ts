import type { RecipeSummary } from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";

const namesList = new Intl.ListFormat("es-AR", { type: "conjunction" });

export function recipeComponentCountText(count: number): string {
  return count === 1 ? "1 componente" : `${formatNumber(count)} componentes`;
}

export function recipeComponentNamesText(components: readonly { name: string }[]): string {
  const names = namesList.format(components.map((component) => component.name));
  return `${names.charAt(0).toUpperCase()}${names.slice(1)}`;
}

export function recipeSubtitle(recipe: RecipeSummary): string {
  return `${recipe.categoryName} · ${recipe.saleUnit === "KG" ? "por peso" : "por unidad"}`;
}

export function recipesCountText(count: number): string {
  return count === 1 ? "1 producto armado" : `${formatNumber(count)} productos armados`;
}
