import { mayBeSplitFromLot } from "../model/lot-split.js";
import type { PurchasedLotStoreTransaction } from "./purchased-lot-store.js";

export interface SplitPurchasedLotInput {
  locationId: string;
  purchaseLineId: string;
  quantity: number;
  expiresOn: string | null;
  occurredAt: Date;
  actorId: string;
}

export type SplitPurchasedLotOutcome =
  | { kind: "not_found" }
  | { kind: "not_enough_in_lot" }
  | { kind: "split"; lotId: string };

export async function splitPurchasedLot(
  tx: PurchasedLotStoreTransaction,
  input: SplitPurchasedLotInput,
): Promise<SplitPurchasedLotOutcome> {
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
  const source = await tx.splittableLot(own.lotId);
  if (source === null) {
    return { kind: "not_found" };
  }
  if (!mayBeSplitFromLot(source, input.quantity)) {
    return { kind: "not_enough_in_lot" };
  }

  const cost = await tx.costOfLot(own.lotId);
  const movementId = await tx.recordMovement({
    ...key,
    kind: "lot_split",
    reason: null,
    delta: 0,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    supersededByCountId: null,
  });
  const lotId = await tx.recordSplitLot({
    ...key,
    purchaseLineId: input.purchaseLineId,
    splitFromLotId: own.lotId,
    quantityReceived: input.quantity,
    cost,
    costIncomplete: source.costIncomplete,
    expiresOn: input.expiresOn,
    purchasedOn: source.purchasedOn,
    createdAt: source.createdAt,
  });
  await tx.allocateToLot({ movementId, lotId: own.lotId, quantity: -input.quantity });
  await tx.allocateToLot({ movementId, lotId, quantity: input.quantity });
  return { kind: "split", lotId };
}
