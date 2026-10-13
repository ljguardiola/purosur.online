import type { SaleUnit } from "../../../catalog/index.js";
import type { RecipeComponent } from "../../model/recipe.js";
import type {
  LockRecipeProductResult,
  NewRecipeFields,
  RecipeReplacementFields,
  RecipeStore,
  RecipeStoreTransaction,
} from "../recipe-store.js";
import { RecipeVersionConflict } from "../recipe-store.js";

export interface FakeRecipeProductRow {
  id: string;
  saleUnit: SaleUnit;
  active: boolean;
}

export interface FakeRecipeRow {
  productId: string;
  components: RecipeComponent[];
  version: number;
  writtenBy: string;
}

interface FakeRecipeState {
  recipes: FakeRecipeRow[];
}

function cloneState(state: FakeRecipeState): FakeRecipeState {
  return {
    recipes: state.recipes.map((row) => ({
      ...row,
      components: row.components.map((component) => ({ ...component })),
    })),
  };
}

class FakeRecipeStoreTransaction implements RecipeStoreTransaction {
  private readonly state: FakeRecipeState;
  private readonly store: FakeRecipeStore;

  constructor(state: FakeRecipeState, store: FakeRecipeStore) {
    this.state = state;
    this.store = store;
  }

  async lockProduct(productId: string): Promise<LockRecipeProductResult> {
    this.store.lockLog.push(productId);
    const product = this.store.products.find((row) => row.id === productId);
    return product ? { kind: "locked", product: { ...product } } : { kind: "not_found" };
  }

  async recipeVersion(productId: string): Promise<number | null> {
    return this.state.recipes.find((row) => row.productId === productId)?.version ?? null;
  }

  async insertRecipe(fields: NewRecipeFields): Promise<void> {
    if (this.store.insertFailure) {
      throw this.store.insertFailure;
    }
    if (this.store.firstRecipeConflicts) {
      throw new RecipeVersionConflict();
    }
    this.state.recipes.push({
      productId: fields.productId,
      components: fields.components.map((component) => ({ ...component })),
      version: 1,
      writtenBy: fields.actorId,
    });
  }

  async replaceRecipe(fields: RecipeReplacementFields): Promise<void> {
    for (const row of this.state.recipes) {
      if (row.productId === fields.productId) {
        row.components = fields.components.map((component) => ({ ...component }));
        row.version = fields.version;
        row.writtenBy = fields.actorId;
      }
    }
  }
}

export class FakeRecipeStore implements RecipeStore {
  private state: FakeRecipeState = { recipes: [] };

  products: FakeRecipeProductRow[] = [];
  lockLog: string[] = [];
  transactionCount = 0;
  firstRecipeConflicts = false;
  insertFailure: Error | null = null;

  seedProduct(product: FakeRecipeProductRow): void {
    this.products.push({ ...product });
  }

  seedRecipe(recipe: Omit<FakeRecipeRow, "writtenBy">): void {
    this.state.recipes.push({
      ...recipe,
      components: recipe.components.map((component) => ({ ...component })),
      writtenBy: "seed",
    });
  }

  snapshot(): FakeRecipeState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: RecipeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeRecipeStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
