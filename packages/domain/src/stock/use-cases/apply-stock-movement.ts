import {
  allocatesToLots,
  movementAllocations,
  type PlannedLotAllocation,
} from "../model/lot-allocation.js";
import { movesBalance } from "../model/stock-receipt.js";
import type { NewStockMovement, ProductStockKey, StockStoreTransaction } from "./stock-store.js";

export interface AppliedStockMovement {
  movementId: string;
  balance: number;
  supersededByCountId: string | null;
}

// The balance only moves through the store's own atomic addition, never by writing back a total
// computed here, so movements committed concurrently can't overwrite one another.
export async function applyStockMovement(
  tx: StockStoreTransaction,
  lockedBalance: number,
  movement: NewStockMovement,
  allocation?: readonly PlannedLotAllocation[],
): Promise<AppliedStockMovement> {
  const { movementId, balance } = await recordStockMovement(tx, movement, allocation);
  return {
    movementId,
    balance: balance ?? lockedBalance,
    supersededByCountId: movement.supersededByCountId,
  };
}

export interface AppliedLotAllocation {
  lotId: string;
  quantity: number;
}

export async function recordStockMovement(
  tx: StockStoreTransaction,
  movement: NewStockMovement,
  allocation?: readonly PlannedLotAllocation[],
): Promise<{ movementId: string; balance: number | null; allocations: AppliedLotAllocation[] }> {
  const movementId = await tx.recordMovement(movement);
  if (!movesBalance(movement)) {
    return { movementId, balance: null, allocations: [] };
  }
  const balance = await tx.addToBalance(movement, movement.delta);
  if (!allocatesToLots(movement.kind)) {
    return { movementId, balance, allocations: [] };
  }
  const planned = allocation ?? movementAllocations(await tx.productLots(movement), movement.delta);
  const allocations = await allocateToLots(tx, movement, movementId, planned);
  return { movementId, balance, allocations };
}

export async function allocateToLots(
  tx: StockStoreTransaction,
  key: ProductStockKey,
  movementId: string,
  planned: readonly PlannedLotAllocation[],
): Promise<AppliedLotAllocation[]> {
  const applied: AppliedLotAllocation[] = [];
  for (const { target, quantity } of planned) {
    const lotId = target.kind === "lot" ? target.lotId : await tx.openTechnicalLot(key);
    await tx.allocateToLot({ movementId, lotId, quantity });
    applied.push({ lotId, quantity });
  }
  return applied;
}
