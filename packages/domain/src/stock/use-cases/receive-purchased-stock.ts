import { lotOfPurchaseLine } from "../model/lot.js";
import type { PurchaseReceipt } from "../model/stock-receipt.js";
import { recordStockMovement } from "./apply-stock-movement.js";
import type { StockStoreTransaction } from "./stock-store.js";

export type ReceivePurchasedStockOutcome =
  | { kind: "not_found"; productId: string }
  | { kind: "received" };

export async function receivePurchasedStock(
  tx: StockStoreTransaction,
  receipt: PurchaseReceipt,
): Promise<ReceivePurchasedStockOutcome> {
  const productIds = [...new Set(receipt.lines.map((line) => line.productId))].sort();
  for (const productId of productIds) {
    const locked = await tx.lockProductStock({ productId, locationId: receipt.locationId });
    if (locked.kind === "not_found") {
      return { kind: "not_found", productId };
    }
  }

  for (const line of receipt.lines) {
    const key = { productId: line.productId, locationId: receipt.locationId };
    const coveringCount = await tx.earliestCountAtOrAfter(key, receipt.occurredAt);
    await recordStockMovement(tx, {
      ...key,
      purchaseLineId: line.purchaseLineId,
      kind: "receipt",
      reason: null,
      delta: line.quantity,
      occurredAt: receipt.occurredAt,
      actorId: receipt.actorId,
      supersededByCountId: coveringCount?.movementId ?? null,
    });
    await tx.recordLot(
      lotOfPurchaseLine({ ...line, id: line.purchaseLineId, locationId: receipt.locationId }),
    );
  }
  return { kind: "received" };
}
