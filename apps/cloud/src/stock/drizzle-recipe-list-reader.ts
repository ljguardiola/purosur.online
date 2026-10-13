import type { SaleUnit } from "@purosur/domain";
import type {
  RecipeComponentListing,
  RecipeListing,
  RecipeListReader,
} from "@purosur/domain/stock/use-cases";
import { asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, products, recipeComponents, recipes } from "../platform/db/schema.js";

export class DrizzleRecipeListReader<TQueryResult extends PgQueryResultHKT>
  implements RecipeListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recipes(): Promise<RecipeListing[]> {
    return this.listings(undefined);
  }

  async recipe(productId: string): Promise<RecipeListing | undefined> {
    const [listing] = await this.listings(productId);
    return listing;
  }

  private async listings(productId: string | undefined): Promise<RecipeListing[]> {
    const rows = await this.db
      .select({
        productId: recipes.productId,
        productName: products.name,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
        version: recipes.version,
      })
      .from(recipes)
      .innerJoin(products, eq(recipes.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(productId === undefined ? undefined : eq(recipes.productId, productId))
      .orderBy(asc(products.name), asc(products.id));
    const components = await this.componentsOf(rows.map((row) => row.productId));
    return rows.map((row) => ({
      ...row,
      saleUnit: row.saleUnit as SaleUnit,
      components: components.get(row.productId) ?? [],
    }));
  }

  private async componentsOf(
    productIds: readonly string[],
  ): Promise<Map<string, RecipeComponentListing[]>> {
    const byRecipe = new Map<string, RecipeComponentListing[]>();
    if (productIds.length === 0) {
      return byRecipe;
    }
    const rows = await this.db
      .select({
        recipeProductId: recipeComponents.productId,
        componentProductId: recipeComponents.componentProductId,
        name: products.name,
        saleUnit: products.saleUnit,
        quantityPerOutputUnit: recipeComponents.quantityPerOutputUnit,
      })
      .from(recipeComponents)
      .innerJoin(products, eq(recipeComponents.componentProductId, products.id))
      .where(inArray(recipeComponents.productId, [...productIds]))
      .orderBy(asc(recipeComponents.productId), asc(recipeComponents.position));
    for (const { recipeProductId, ...component } of rows) {
      byRecipe.set(recipeProductId, [
        ...(byRecipe.get(recipeProductId) ?? []),
        { ...component, saleUnit: component.saleUnit as SaleUnit },
      ]);
    }
    return byRecipe;
  }
}
