import type { SaleUnit } from "../../catalog/index.js";
import {
  isQuantityPerOutputUnit,
  mayBeInRecipe,
  productsInLockOrder,
  type RecipeComponent,
  type RecipeShapeRefusal,
  recipeShapeRefusal,
} from "../model/recipe.js";
import type { LockRecipeProductResult, Recipe, RecipeStore } from "./recipe-store.js";
import { RecipeVersionConflict } from "./recipe-store.js";

export interface SaveRecipeInput {
  productId: string;
  components: readonly RecipeComponent[];
  version: number | null;
  actorId: string;
}

export type InvalidRecipeReason =
  | RecipeShapeRefusal
  | { kind: "invalid_quantity"; componentProductId: string };

export type SaveRecipeOutcome =
  | { kind: "product_not_found" }
  | { kind: "component_not_found"; componentProductId: string }
  | { kind: "invalid_recipe"; reason: InvalidRecipeReason }
  | { kind: "stale_version" }
  | { kind: "saved"; recipe: Recipe };

export async function saveRecipe(
  store: RecipeStore,
  input: SaveRecipeInput,
): Promise<SaveRecipeOutcome> {
  const shapeRefusal = recipeShapeRefusal(input.productId, input.components);
  if (shapeRefusal) {
    return { kind: "invalid_recipe", reason: shapeRefusal };
  }

  try {
    return await store.transaction(async (tx) => {
      const locked = new Map<string, LockRecipeProductResult>();
      for (const productId of productsInLockOrder(input.productId, input.components)) {
        locked.set(productId, await tx.lockProduct(productId));
      }

      const assembled = locked.get(input.productId);
      if (assembled?.kind !== "locked" || !mayBeInRecipe(assembled.product)) {
        return { kind: "product_not_found" };
      }

      const withSaleUnits: { component: RecipeComponent; saleUnit: SaleUnit }[] = [];
      for (const component of input.components) {
        const product = locked.get(component.componentProductId);
        if (product?.kind !== "locked" || !mayBeInRecipe(product.product)) {
          return { kind: "component_not_found", componentProductId: component.componentProductId };
        }
        withSaleUnits.push({ component, saleUnit: product.product.saleUnit });
      }

      const currentVersion = await tx.recipeVersion(input.productId);
      if (currentVersion !== input.version) {
        return { kind: "stale_version" };
      }

      for (const { component, saleUnit } of withSaleUnits) {
        if (!isQuantityPerOutputUnit(saleUnit, component.quantityPerOutputUnit)) {
          return {
            kind: "invalid_recipe",
            reason: { kind: "invalid_quantity", componentProductId: component.componentProductId },
          };
        }
      }

      const components = input.components.map((component) => ({ ...component }));
      const version = (currentVersion ?? 0) + 1;
      if (currentVersion === null) {
        await tx.insertRecipe({ productId: input.productId, components, actorId: input.actorId });
      } else {
        await tx.replaceRecipe({
          productId: input.productId,
          components,
          version,
          actorId: input.actorId,
        });
      }
      return { kind: "saved", recipe: { productId: input.productId, components, version } };
    });
  } catch (error) {
    if (error instanceof RecipeVersionConflict) {
      return { kind: "stale_version" };
    }
    throw error;
  }
}
