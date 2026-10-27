import { isLotCostIncomplete } from "@purosur/domain";
import type {
  AssemblyBatchStore,
  AssemblyBatchTransaction,
  AssemblyBatchVoid,
  BatchLotCost,
  BatchMovementAllocation,
  LockedAssemblyBatch,
  NewAssemblyBatch,
  NewBatchLot,
  Recipe,
} from "@purosur/domain/stock/use-cases";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  assemblyBatches,
  assemblyBatchLines,
  lotAllocations,
  lots,
  products,
  recipeComponents,
  recipes,
  stockMovements,
} from "../platform/db/schema.js";
import { withPendingChanges } from "../sync/change-log.js";
import { batchLotConsumed } from "./assembly-batch-lot-consumption.js";
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
      costIncomplete: isLotCostIncomplete(lot),
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

  async lockAssemblyBatch(
    batchId: string,
    locationId: string,
  ): Promise<LockedAssemblyBatch | undefined> {
    const [batch] = await this.tx
      .select({
        id: assemblyBatches.id,
        productId: assemblyBatches.productId,
        voidedAt: assemblyBatches.voidedAt,
      })
      .from(assemblyBatches)
      .where(and(eq(assemblyBatches.id, batchId), eq(assemblyBatches.locationId, locationId)))
      .for("update");
    if (!batch) {
      return undefined;
    }
    const [lot] = await this.tx
      .select({ id: lots.id })
      .from(lots)
      .where(eq(lots.assemblyBatchId, batch.id));
    if (!lot) {
      throw new Error("the assembly batch has no lot");
    }
    const lines = await this.tx
      .select({ componentProductId: assemblyBatchLines.componentProductId })
      .from(assemblyBatchLines)
      .where(eq(assemblyBatchLines.batchId, batch.id));
    return {
      id: batch.id,
      productId: batch.productId,
      lotId: lot.id,
      voided: batch.voidedAt !== null,
      componentProductIds: lines.map((line) => line.componentProductId),
    };
  }

  async assemblyBatchAllocations(batchId: string): Promise<BatchMovementAllocation[]> {
    const found = await this.tx
      .select({
        productId: stockMovements.productId,
        kind: stockMovements.kind,
        lotId: lotAllocations.lotId,
        quantity: lotAllocations.quantity,
      })
      .from(lotAllocations)
      .innerJoin(stockMovements, eq(stockMovements.id, lotAllocations.movementId))
      .where(
        and(
          eq(stockMovements.assemblyBatchId, batchId),
          inArray(stockMovements.kind, ["assembly_out", "assembly_in"]),
        ),
      );
    return found.map((allocation) => ({
      ...allocation,
      kind: allocation.kind as BatchMovementAllocation["kind"],
    }));
  }

  async isBatchLotConsumed(batchId: string): Promise<boolean> {
    const [found] = await this.tx
      .select({ consumed: batchLotConsumed(assemblyBatches.id) })
      .from(assemblyBatches)
      .where(eq(assemblyBatches.id, batchId));
    return found?.consumed === true;
  }

  async recordAssemblyBatchVoid(batchVoid: AssemblyBatchVoid): Promise<void> {
    const [updated] = await this.tx
      .update(assemblyBatches)
      .set({ voidedAt: batchVoid.voidedAt, voidedBy: batchVoid.actorId })
      .where(eq(assemblyBatches.id, batchVoid.batchId))
      .returning({ id: assemblyBatches.id });
    if (!updated) {
      throw new Error("voiding the assembly batch updated no row");
    }
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
