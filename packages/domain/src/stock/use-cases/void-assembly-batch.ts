import { voidedMovementAllocations } from "../model/lot-allocation.js";
import { productsInLockOrder } from "../model/recipe.js";
import { recordStockMovement } from "./apply-stock-movement.js";
import type { AssemblyBatchPorts, BatchMovementAllocation } from "./assembly-batch-store.js";

export interface VoidAssemblyBatchInput {
  batchId: string;
  locationId: string;
  actorId: string;
}

export type VoidAssemblyBatchOutcome =
  | { kind: "not_found" }
  | { kind: "already_voided" }
  | { kind: "consumed" }
  | { kind: "voided"; batch: { id: string; voidedAt: Date } };

function allocationsOf(
  allocations: readonly BatchMovementAllocation[],
  productId: string,
): BatchMovementAllocation[] {
  return allocations.filter((allocation) => allocation.productId === productId);
}

export async function voidAssemblyBatch(
  { store, clock }: AssemblyBatchPorts,
  input: VoidAssemblyBatchInput,
): Promise<VoidAssemblyBatchOutcome> {
  return store.transaction<VoidAssemblyBatchOutcome>(async (tx) => {
    const batch = await tx.lockAssemblyBatch(input.batchId, input.locationId);
    if (batch === undefined) {
      return { kind: "not_found" };
    }
    if (batch.voided) {
      return { kind: "already_voided" };
    }

    const lockOrder = productsInLockOrder(
      batch.productId,
      batch.componentProductIds.map((componentProductId) => ({
        componentProductId,
        quantityPerOutputUnit: 0,
      })),
    );
    for (const productId of lockOrder) {
      await tx.lockProductStock({ productId, locationId: input.locationId });
    }
    if (await tx.isBatchLotConsumed(batch.id)) {
      return { kind: "consumed" };
    }

    const voidedAt = clock.now();
    const original = await tx.assemblyBatchAllocations(batch.id);
    for (const productId of lockOrder) {
      const moved = allocationsOf(original, productId);
      if (moved.length === 0) {
        continue;
      }
      const key = { productId, locationId: input.locationId };
      const delta = -moved.reduce((sum, allocation) => sum + allocation.quantity, 0);
      const coveringCount = await tx.earliestCountAtOrAfter(key, voidedAt);
      await recordStockMovement(
        tx,
        {
          ...key,
          assemblyBatchId: batch.id,
          kind: "assembly_void",
          reason: null,
          delta,
          occurredAt: voidedAt,
          actorId: input.actorId,
          supersededByCountId: coveringCount?.movementId ?? null,
        },
        voidedMovementAllocations(await tx.productLots(key), moved, delta),
      );
    }

    await tx.recordAssemblyBatchVoid({
      batchId: batch.id,
      voidedAt,
      actorId: input.actorId,
    });
    return { kind: "voided", batch: { id: batch.id, voidedAt } };
  });
}
