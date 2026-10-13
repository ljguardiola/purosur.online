import type { SaleUnit } from "../../catalog/index.js";

export interface RecipeComponentListing {
  componentProductId: string;
  name: string;
  saleUnit: SaleUnit;
  quantityPerOutputUnit: number;
}

export interface RecipeListing {
  productId: string;
  productName: string;
  categoryName: string;
  saleUnit: SaleUnit;
  version: number;
  // In the order the recipe was saved.
  components: RecipeComponentListing[];
}

export interface RecipeListReader {
  // The assembled products that have a recipe, ordered by name.
  recipes(): Promise<RecipeListing[]>;
  recipe(productId: string): Promise<RecipeListing | undefined>;
}
