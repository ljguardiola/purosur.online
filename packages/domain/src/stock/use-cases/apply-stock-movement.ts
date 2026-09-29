import type { NewStockMovement, StockStoreTransaction } from "./stock-store.js";

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
  const movementId = await tx.recordMovement(movement);
  const { supersededByCountId } = movement;
  const balance =
    supersededByCountId === null ? await tx.addToBalance(movement, movement.delta) : lockedBalance;
  return { movementId, balance, supersededByCountId };
}
