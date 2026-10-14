import type {
  AssemblyBatchStore,
  AssemblyBatchTransaction,
  BatchLotCost,
  NewAssemblyBatch,
  NewBatchLot,
  Recipe,
} from "@purosur/domain/stock/use-cases";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assemblyBatches,
  assemblyBatchLines,
  lots,
  products,
  recipeComponents,
  recipes,
} from "../platform/db/schema.js";
import { withPendingChanges } from "../sync/change-log.js";
import { DrizzleStockStoreTransaction } from "./drizzle-stock-store.js";

class DrizzleAssemblyBatchTransaction<TQueryResult extends PgQueryResultHKT>
  extends DrizzleStockStoreTransaction<TQueryResult>
  implements AssemblyBatchTransaction
{
  async recipe(productId: string): Promise<Recipe | undefined> {
    const [found] = await this.tx
      .select({ version: recipes.version })
      .from(recipes)
      .where(eq(recipes.productId, productId));
    if (!found) {
      return undefined;
    }
    const components = await this.tx
      .select({
        componentProductId: recipeComponents.componentProductId,
        quantityPerOutputUnit: recipeComponents.quantityPerOutputUnit,
      })
      .from(recipeComponents)
      .where(eq(recipeComponents.productId, productId))
      .orderBy(asc(recipeComponents.position));
    return { productId, version: found.version, components };
  }

  async activeProductIds(productIds: readonly string[]): Promise<string[]> {
    const found = await this.tx
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, [...productIds]), eq(products.active, true)));
    return found.map((product) => product.id);
  }

  async lotCosts(lotIds: readonly string[]): Promise<BatchLotCost[]> {
    if (lotIds.length === 0) {
      return [];
    }
    const found = await this.tx
      .select({
        lotId: lots.id,
        technical: lots.technical,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
        expiresOn: lots.expiresOn,
      })
      .from(lots)
      .where(inArray(lots.id, [...lotIds]));
    return found.map((lot) => ({
      lotId: lot.lotId,
      cost:
        lot.costTotalCents === null || lot.costQuantity === null
          ? null
          : { totalCents: lot.costTotalCents, quantity: lot.costQuantity },
      costIncomplete: lot.technical || lot.costIncomplete,
      expiresOn: lot.expiresOn,
    }));
  }

  async insertAssemblyBatch(batch: NewAssemblyBatch): Promise<string> {
    const { lines, output, ...fields } = batch;
    const [inserted] = await this.tx
      .insert(assemblyBatches)
      .values({ ...fields, outputQty: output })
      .returning({ id: assemblyBatches.id });
    if (!inserted) {
      throw new Error("inserting the assembly batch returned no row");
    }
    await this.tx
      .insert(assemblyBatchLines)
      .values(lines.map((line) => ({ batchId: inserted.id, ...line })));
    return inserted.id;
  }

  async recordBatchLot(lot: NewBatchLot): Promise<string> {
    const [recorded] = await this.tx.insert(lots).values(lot).returning({ id: lots.id });
    if (!recorded) {
      throw new Error("inserting the batch lot returned no row");
    }
    return recorded.id;
  }
}

export class DrizzleAssemblyBatchStore<TQueryResult extends PgQueryResultHKT>
  implements AssemblyBatchStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: AssemblyBatchTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleAssemblyBatchTransaction(tx, pending)),
    );
  }
}
