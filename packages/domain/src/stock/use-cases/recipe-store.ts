import type { SaleUnit } from "../../catalog/index.js";
import type { RecipeComponent } from "../model/recipe.js";

export interface Recipe {
  productId: string;
  components: RecipeComponent[];
  version: number;
}

export interface NewRecipeFields {
  productId: string;
  components: readonly RecipeComponent[];
  actorId: string;
}

export interface RecipeReplacementFields extends NewRecipeFields {
  version: number;
}

export type LockRecipeProductResult =
  | { kind: "not_found" }
  | { kind: "locked"; product: { id: string; saleUnit: SaleUnit; active: boolean } };

// Raised by a write that loses the first recipe of a product to a concurrent write.
export class RecipeVersionConflict extends Error {}

export interface RecipeStoreTransaction {
  // Holds the product's row, whether it is the assembled product or a component.
  lockProduct(productId: string): Promise<LockRecipeProductResult>;
  // The version of the product's recipe, or null when it has none.
  recipeVersion(productId: string): Promise<number | null>;
  insertRecipe(fields: NewRecipeFields): Promise<void>;
  // Replaces the whole recipe, components included.
  replaceRecipe(fields: RecipeReplacementFields): Promise<void>;
}

export interface RecipeStore {
  transaction<TOutcome>(
    work: (tx: RecipeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
