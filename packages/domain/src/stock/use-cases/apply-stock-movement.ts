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
): Promise<AppliedStockMovement> {
  const { movementId, balance } = await recordStockMovement(tx, movement);
  return {
    movementId,
    balance: balance ?? lockedBalance,
    supersededByCountId: movement.supersededByCountId,
  };
}

export async function recordStockMovement(
  tx: StockStoreTransaction,
  movement: NewStockMovement,
): Promise<{ movementId: string; balance: number | null }> {
  const movementId = await tx.recordMovement(movement);
  if (!movesBalance(movement)) {
    return { movementId, balance: null };
  }
  const balance = await tx.addToBalance(movement, movement.delta);
  if (allocatesToLots(movement.kind)) {
    const lots = await tx.productLots(movement);
    await allocateToLots(tx, movement, movementId, movementAllocations(lots, movement.delta));
  }
  return { movementId, balance };
}

export async function allocateToLots(
  tx: StockStoreTransaction,
  key: ProductStockKey,
  movementId: string,
  planned: readonly PlannedLotAllocation[],
): Promise<void> {
  for (const { target, quantity } of planned) {
    const lotId = target.kind === "lot" ? target.lotId : await tx.openTechnicalLot(key);
    await tx.allocateToLot({ movementId, lotId, quantity });
  }
}
