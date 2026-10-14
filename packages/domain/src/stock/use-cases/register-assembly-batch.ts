import type { SaleUnit } from "../../catalog/index.js";
import {
  type BatchComponentUse,
  type BatchQuantityRefusal,
  batchLotFacts,
  batchQuantityRefusal,
  type ConsumedAllocation,
  pairedWithRecipe,
} from "../model/assembly-batch.js";
import { lotOfAssemblyBatch } from "../model/lot.js";
import { knownLotCost } from "../model/lot-value.js";
import { mayBeInRecipe, productsInLockOrder } from "../model/recipe.js";
import { lotUnitCostCents } from "../model/unit-cost.js";
import { type AppliedLotAllocation, recordStockMovement } from "./apply-stock-movement.js";
import type { AssemblyBatchPorts } from "./assembly-batch-store.js";
import { recordLotReceipt } from "./record-lot-receipt.js";

export interface RegisterAssemblyBatchInput {
  productId: string;
  locationId: string;
  recipeVersion: number;
  used: readonly BatchComponentUse[];
  output: number;
  actorId: string;
}

export interface RegisteredAssemblyBatch {
  id: string;
  productId: string;
  locationId: string;
  assembledAt: Date;
  output: number;
  unitCostCents: number | null;
  costIncomplete: boolean;
  expiresOn: string | null;
}

export type RegisterAssemblyBatchOutcome =
  | { kind: "product_not_found" }
  | { kind: "no_recipe" }
  | { kind: "stale_recipe" }
  | BatchQuantityRefusal
  | { kind: "recorded"; batch: RegisteredAssemblyBatch };

export async function registerAssemblyBatch(
  { store, clock }: AssemblyBatchPorts,
  input: RegisterAssemblyBatchInput,
): Promise<RegisterAssemblyBatchOutcome> {
  return store.transaction<RegisterAssemblyBatchOutcome>(async (tx) => {
    const saleUnits = new Map<string, SaleUnit>();
    const lockOrder = productsInLockOrder(
      input.productId,
      input.used.map(({ componentProductId }) => ({
        componentProductId,
        quantityPerOutputUnit: 0,
      })),
    );
    for (const productId of lockOrder) {
      const locked = await tx.lockProductStock({ productId, locationId: input.locationId });
      if (locked.kind === "locked") {
        saleUnits.set(productId, locked.saleUnit);
      }
    }

    const assembledSaleUnit = saleUnits.get(input.productId);
    if (assembledSaleUnit === undefined) {
      return { kind: "product_not_found" };
    }
    const recipe = await tx.recipe(input.productId);
    if (recipe === undefined) {
      return { kind: "no_recipe" };
    }
    const paired = pairedWithRecipe(recipe.components, input.used);
    if (recipe.version !== input.recipeVersion || paired === null) {
      return { kind: "stale_recipe" };
    }

    const active = new Set(await tx.activeProductIds(lockOrder));
    const components: (BatchComponentUse & { saleUnit: SaleUnit })[] = [];
    for (const { componentProductId, quantity } of paired) {
      const saleUnit = saleUnits.get(componentProductId);
      if (saleUnit === undefined) {
        return { kind: "product_not_found" };
      }
      components.push({ componentProductId, quantity, saleUnit });
    }
    if (!lockOrder.every((id) => mayBeInRecipe({ active: active.has(id) }))) {
      return { kind: "product_not_found" };
    }

    const refusal = batchQuantityRefusal({
      assembledSaleUnit,
      components,
      output: input.output,
    });
    if (refusal) {
      return refusal;
    }

    const assembledAt = clock.now();
    const batchId = await tx.insertAssemblyBatch({
      productId: input.productId,
      locationId: input.locationId,
      assembledAt,
      output: input.output,
      actorId: input.actorId,
      lines: components.map(({ componentProductId, quantity }) => ({
        componentProductId,
        quantity,
      })),
    });

    const consumed: AppliedLotAllocation[] = [];
    for (const use of components.filter((candidate) => candidate.quantity > 0)) {
      const key = { productId: use.componentProductId, locationId: input.locationId };
      const coveringCount = await tx.earliestCountAtOrAfter(key, assembledAt);
      const { allocations } = await recordStockMovement(tx, {
        ...key,
        assemblyBatchId: batchId,
        kind: "assembly_out",
        reason: null,
        delta: -use.quantity,
        occurredAt: assembledAt,
        actorId: input.actorId,
        supersededByCountId: coveringCount?.movementId ?? null,
      });
      consumed.push(...allocations);
    }

    const lotCosts = await tx.lotCosts([
      ...new Set(consumed.map((allocation) => allocation.lotId)),
    ]);
    const allocations: ConsumedAllocation[] = lotCosts.map((lotCost) => ({
      cost: knownLotCost(lotCost),
      expiresOn: lotCost.expiresOn,
      quantity: consumed
        .filter((allocation) => allocation.lotId === lotCost.lotId)
        .reduce((sum, allocation) => sum - allocation.quantity, 0),
    }));
    const facts = batchLotFacts(allocations, input.output);

    const key = { productId: input.productId, locationId: input.locationId };
    const coveringCount = await tx.earliestCountAtOrAfter(key, assembledAt);
    await recordLotReceipt(
      tx,
      {
        ...key,
        assemblyBatchId: batchId,
        kind: "assembly_in",
        reason: null,
        delta: input.output,
        occurredAt: assembledAt,
        actorId: input.actorId,
        supersededByCountId: coveringCount?.movementId ?? null,
      },
      () =>
        tx.recordBatchLot(lotOfAssemblyBatch({ ...key, batchId, output: input.output, ...facts })),
    );

    return {
      kind: "recorded",
      batch: {
        id: batchId,
        productId: input.productId,
        locationId: input.locationId,
        assembledAt,
        output: input.output,
        unitCostCents: lotUnitCostCents({
          cost: { totalCents: facts.costTotalCents, quantity: facts.costQuantity },
          costIncomplete: facts.costIncomplete,
        }),
        costIncomplete: facts.costIncomplete,
        expiresOn: facts.expiresOn,
      },
    };
  });
}
