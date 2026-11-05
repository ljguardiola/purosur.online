import type { LotCost } from "../model/lot-value.js";
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
  const lots = await tx.lotsOfPurchaseLines(input.locationId, [input.purchaseLineId]);
  const [first] = lots;
  if (!first) {
    return { kind: "not_found" };
  }
  const locked = await tx.lockProductStock({
    productId: first.productId,
    locationId: input.locationId,
  });
  if (locked.kind === "not_found") {
    return { kind: "not_found" };
  }
  const corrections: { lotId: string; previous: LotCost }[] = [];
  for (const lot of lots) {
    const previous = await tx.costOfLot(lot.lotId);
    if (previous === null) {
      return { kind: "not_found" };
    }
    corrections.push({ lotId: lot.lotId, previous });
  }
  for (const { lotId, previous } of corrections) {
    await tx.recordLotCostChange({ lotId, changedAt: input.changedAt, previous });
    await tx.setLotCost(lotId, { totalCents: input.totalCents, quantity: previous.quantity });
  }
  return { kind: "corrected" };
}
