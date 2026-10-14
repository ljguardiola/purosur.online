import { receiptAllocations } from "../model/lot-allocation.js";
import { allocateToLots, recordStockMovement } from "./apply-stock-movement.js";
import type { NewStockMovement, StockStoreTransaction } from "./stock-store.js";

export async function recordLotReceipt(
  tx: StockStoreTransaction,
  movement: NewStockMovement,
  recordLot: () => Promise<string>,
): Promise<{ movementId: string; lotId: string }> {
  const { movementId, balance } = await recordStockMovement(tx, movement);
  const lots = await tx.productLots(movement);
  const lotId = await recordLot();
  if (balance !== null) {
    await allocateToLots(tx, movement, movementId, receiptAllocations(lotId, lots, movement.delta));
  }
  return { movementId, lotId };
}
