import { lotUnitCostCents, type SaleUnit } from "@purosur/domain";
import type {
  RecipeComponentListing,
  RecipeLastBatch,
  RecipeListing,
  RecipeListReader,
} from "@purosur/domain/stock/use-cases";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  assemblyBatches,
  brands,
  categories,
  lots,
  products,
  recipeComponents,
  recipes,
} from "../platform/db/schema.js";

export class DrizzleRecipeListReader<TQueryResult extends PgQueryResultHKT>
  implements RecipeListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recipes(locationId: string): Promise<RecipeListing[]> {
    return this.listings(locationId, undefined);
  }

  async recipe(productId: string, locationId: string): Promise<RecipeListing | undefined> {
    const [listing] = await this.listings(locationId, productId);
    return listing;
  }

  private async listings(
    locationId: string,
    productId: string | undefined,
  ): Promise<RecipeListing[]> {
    const rows = await this.db
      .select({
        productId: recipes.productId,
        productName: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
        version: recipes.version,
      })
      .from(recipes)
      .innerJoin(products, eq(recipes.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(productId === undefined ? undefined : eq(recipes.productId, productId))
      .orderBy(asc(products.name), asc(products.id));
    const productIds = rows.map((row) => row.productId);
    const components = await this.componentsOf(productIds);
    const lastBatches = await this.lastBatchesOf(productIds, locationId);
    return rows.map(({ netContentQuantity, netContentUnit, ...row }) => ({
      ...row,
      netContent: netContentRow({ netContentQuantity, netContentUnit }),
      saleUnit: row.saleUnit as SaleUnit,
      lastBatch: lastBatches.get(row.productId) ?? null,
      components: components.get(row.productId) ?? [],
    }));
  }

  private async lastBatchesOf(
    productIds: readonly string[],
    locationId: string,
  ): Promise<Map<string, RecipeLastBatch>> {
    const lastBatches = new Map<string, RecipeLastBatch>();
    if (productIds.length === 0) {
      return lastBatches;
    }
    const rows = await this.db
      .select({
        productId: assemblyBatches.productId,
        assembledAt: assemblyBatches.assembledAt,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
        costIncomplete: lots.costIncomplete,
      })
      .from(assemblyBatches)
      .innerJoin(lots, eq(lots.assemblyBatchId, assemblyBatches.id))
      .where(
        and(
          inArray(assemblyBatches.productId, [...productIds]),
          eq(assemblyBatches.locationId, locationId),
          isNull(assemblyBatches.voidedAt),
        ),
      )
      .orderBy(desc(assemblyBatches.assembledAt), desc(assemblyBatches.id));
    for (const row of rows) {
      if (!lastBatches.has(row.productId)) {
        lastBatches.set(row.productId, {
          unitCostCents: lotUnitCostCents({
            cost:
              row.costTotalCents !== null && row.costQuantity !== null
                ? { totalCents: row.costTotalCents, quantity: row.costQuantity }
                : null,
            costIncomplete: row.costIncomplete,
          }),
          costIncomplete: row.costIncomplete,
          assembledAt: row.assembledAt,
        });
      }
    }
    return lastBatches;
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
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
        quantityPerOutputUnit: recipeComponents.quantityPerOutputUnit,
      })
      .from(recipeComponents)
      .innerJoin(products, eq(recipeComponents.componentProductId, products.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(inArray(recipeComponents.productId, [...productIds]))
      .orderBy(asc(recipeComponents.productId), asc(recipeComponents.position));
    for (const { recipeProductId, netContentQuantity, netContentUnit, ...component } of rows) {
      byRecipe.set(recipeProductId, [
        ...(byRecipe.get(recipeProductId) ?? []),
        {
          ...component,
          netContent: netContentRow({ netContentQuantity, netContentUnit }),
          saleUnit: component.saleUnit as SaleUnit,
        },
      ]);
    }
    return byRecipe;
  }
}
