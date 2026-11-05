import type { PurchasedLotStoreTransaction } from "./purchased-lot-store.js";

export interface CorrectPurchasedLotCostInput {
  locationId: string;
  purchaseLineId: string;
  totalCents: number;
  changedAt: Date;
}

export type CorrectPurchasedLotCostOutcome = { kind: "not_found" } | { kind: "corrected" };

export async function correctPurchasedLotCost(
  tx: PurchasedLotStoreTransaction,
  input: CorrectPurchasedLotCostInput,
): Promise<CorrectPurchasedLotCostOutcome> {
  const [lot] = await tx.lotsOfPurchaseLines(input.locationId, [input.purchaseLineId]);
  if (!lot) {
    return { kind: "not_found" };
  }
  const locked = await tx.lockProductStock({
    productId: lot.productId,
    locationId: input.locationId,
  });
  if (locked.kind === "not_found") {
    return { kind: "not_found" };
  }
  const previous = await tx.costOfLot(lot.lotId);
  if (previous === null) {
    return { kind: "not_found" };
  }
  await tx.recordLotCostChange({ lotId: lot.lotId, changedAt: input.changedAt, previous });
  await tx.setLotCost(lot.lotId, { totalCents: input.totalCents, quantity: previous.quantity });
  return { kind: "corrected" };
}
