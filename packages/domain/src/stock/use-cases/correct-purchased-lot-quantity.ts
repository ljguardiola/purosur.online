import { isMovementQuantity } from "../model/stock-quantity.js";
import { movesBalance } from "../model/stock-receipt.js";
import type {
  PurchasedLotQuantityStoreTransaction,
  PurchasedLotStoreTransaction,
} from "./purchased-lot-store.js";
import type { StockStoreTransaction } from "./stock-store.js";

export interface CorrectPurchasedLotQuantityInput {
  locationId: string;
  purchaseLineId: string;
  delta: number;
  actorId: string;
}

export type CorrectPurchasedLotQuantityOutcome =
  | { kind: "not_found" }
  | { kind: "invalid_quantity" }
  | { kind: "not_enough_in_lot" }
  | { kind: "corrected" };

export type CorrectPurchasedLotQuantityTransaction = Pick<
  PurchasedLotStoreTransaction,
  "lotsOfPurchaseLines" | "splittableLot" | "lockProductStock" | "recordMovement" | "allocateToLot"
> &
  Pick<StockStoreTransaction, "earliestCountAtOrAfter" | "addToBalance"> &
  PurchasedLotQuantityStoreTransaction;

export async function correctPurchasedLotQuantity(
  tx: CorrectPurchasedLotQuantityTransaction,
  input: CorrectPurchasedLotQuantityInput,
): Promise<CorrectPurchasedLotQuantityOutcome> {
  const lots = await tx.lotsOfPurchaseLines(input.locationId, [input.purchaseLineId]);
  const own = lots.find((lot) => lot.splitFromLotId === null);
  if (!own) {
    return { kind: "not_found" };
  }
  const key = { productId: own.productId, locationId: input.locationId };
  const locked = await tx.lockProductStock(key);
  if (locked.kind === "not_found") {
    return { kind: "not_found" };
  }
  if (!isMovementQuantity(locked.saleUnit, Math.abs(input.delta))) {
    return { kind: "invalid_quantity" };
  }
  const receivedAt = await tx.receiptInstantOfPurchaseLine(input.purchaseLineId);
  if (receivedAt === undefined) {
    return { kind: "not_found" };
  }
  const coveringCount = await tx.earliestCountAtOrAfter(key, receivedAt);
  if (coveringCount === undefined) {
    const source = await tx.splittableLot(own.lotId);
    if (source === null) {
      return { kind: "not_found" };
    }
    if (-input.delta > Math.max(0, source.remaining)) {
      return { kind: "not_enough_in_lot" };
    }
  }

  const movement = {
    ...key,
    purchaseLineId: input.purchaseLineId,
    kind: "receipt",
    reason: null,
    delta: input.delta,
    occurredAt: receivedAt,
    actorId: input.actorId,
    supersededByCountId: coveringCount?.movementId ?? null,
  } as const;
  const movementId = await tx.recordMovement(movement);
  if (movesBalance(movement)) {
    await tx.addToBalance(key, input.delta);
    await tx.allocateToLot({ movementId, lotId: own.lotId, quantity: input.delta });
    await tx.addToLotQuantityReceived(own.lotId, input.delta);
  }
  return { kind: "corrected" };
}
