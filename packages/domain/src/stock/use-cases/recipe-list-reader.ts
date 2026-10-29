import type { SaleUnit } from "../../catalog/index.js";
import type { ProductBrandAndNetContent } from "../model/product-brand-and-net-content.js";

export interface RecipeComponentListing extends ProductBrandAndNetContent {
  componentProductId: string;
  name: string;
  saleUnit: SaleUnit;
  quantityPerOutputUnit: number;
}

export interface RecipeLastBatch {
  unitCostCents: number | null;
  costIncomplete: boolean;
  assembledAt: Date;
}

export interface RecipeListing extends ProductBrandAndNetContent {
  productId: string;
  productName: string;
  categoryName: string;
  saleUnit: SaleUnit;
  version: number;
  // The most recent batch made at the location asked for.
  lastBatch: RecipeLastBatch | null;
  // In the order the recipe was saved.
  components: RecipeComponentListing[];
}

export interface RecipeListReader {
  // The assembled products that have a recipe, ordered by name.
  recipes(locationId: string): Promise<RecipeListing[]>;
  recipe(productId: string, locationId: string): Promise<RecipeListing | undefined>;
}
