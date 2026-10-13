import {
  isInActivityScope,
  type ProductActivityScope,
  type SaleUnit,
} from "../../catalog/index.js";
import { isMovementQuantity } from "./stock-quantity.js";

export const PRODUCTS_A_RECIPE_MAY_USE: ProductActivityScope = "active";

export interface RecipeComponent {
  componentProductId: string;
  quantityPerOutputUnit: number;
}

export type RecipeShapeRefusal =
  | { kind: "no_components" }
  | { kind: "self_component" }
  | { kind: "repeated_component"; componentProductId: string };

export function mayBeInRecipe(product: { active: boolean }): boolean {
  return isInActivityScope(product.active, PRODUCTS_A_RECIPE_MAY_USE);
}

export function isQuantityPerOutputUnit(componentSaleUnit: SaleUnit, quantity: number): boolean {
  return isMovementQuantity(componentSaleUnit, quantity);
}

export function recipeShapeRefusal(
  assembledProductId: string,
  components: readonly RecipeComponent[],
): RecipeShapeRefusal | null {
  if (components.length === 0) {
    return { kind: "no_components" };
  }
  const seen = new Set<string>();
  for (const { componentProductId } of components) {
    if (componentProductId === assembledProductId) {
      return { kind: "self_component" };
    }
    if (seen.has(componentProductId)) {
      return { kind: "repeated_component", componentProductId };
    }
    seen.add(componentProductId);
  }
  return null;
}

export function productsInLockOrder(
  assembledProductId: string,
  components: readonly RecipeComponent[],
): string[] {
  return [
    ...new Set([
      assembledProductId,
      ...components.map((component) => component.componentProductId),
    ]),
  ].sort();
}
