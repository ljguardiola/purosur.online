import type { SaleUnit } from "@purosur/domain";
import {
  type LockRecipeProductResult,
  type NewRecipeFields,
  type RecipeReplacementFields,
  type RecipeStore,
  type RecipeStoreTransaction,
  RecipeVersionConflict,
} from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { products, recipeComponents, recipes } from "../platform/db/schema.js";

const UNIQUE_VIOLATION = "23505";
const RECIPE_PRIMARY_KEY = "recipes_pkey";

function translateRecipeViolation(error: unknown): unknown {
  return postgresErrorChain(error).some(
    (link) => link.code === UNIQUE_VIOLATION && link.constraint === RECIPE_PRIMARY_KEY,
  )
    ? new RecipeVersionConflict()
    : error;
}

class DrizzleRecipeStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements RecipeStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: PgDatabase<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockProduct(productId: string): Promise<LockRecipeProductResult> {
    const [product] = await this.tx
      .select({ id: products.id, saleUnit: products.saleUnit, active: products.active })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    return product
      ? { kind: "locked", product: { ...product, saleUnit: product.saleUnit as SaleUnit } }
      : { kind: "not_found" };
  }

  async recipeVersion(productId: string): Promise<number | null> {
    const [recipe] = await this.tx
      .select({ version: recipes.version })
      .from(recipes)
      .where(eq(recipes.productId, productId));
    return recipe?.version ?? null;
  }

  async insertRecipe(fields: NewRecipeFields): Promise<void> {
    try {
      await this.tx
        .insert(recipes)
        .values({ productId: fields.productId, actorId: fields.actorId, updatedAt: this.now() });
    } catch (error) {
      throw translateRecipeViolation(error);
    }
    await this.insertComponents(fields);
  }

  async replaceRecipe(fields: RecipeReplacementFields): Promise<void> {
    await this.tx.delete(recipeComponents).where(eq(recipeComponents.productId, fields.productId));
    await this.tx
      .update(recipes)
      .set({ version: fields.version, actorId: fields.actorId, updatedAt: this.now() })
      .where(eq(recipes.productId, fields.productId));
    await this.insertComponents(fields);
  }

  private async insertComponents(fields: NewRecipeFields): Promise<void> {
    await this.tx.insert(recipeComponents).values(
      fields.components.map((component, position) => ({
        productId: fields.productId,
        componentProductId: component.componentProductId,
        quantityPerOutputUnit: component.quantityPerOutputUnit,
        position,
      })),
    );
  }
}

export class DrizzleRecipeStore<TQueryResult extends PgQueryResultHKT> implements RecipeStore {
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: RecipeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleRecipeStoreTransaction(tx, this.now)));
  }
}
