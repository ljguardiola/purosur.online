import type { PurchasedLotStoreTransaction } from "./purchased-lot-store.js";

export interface CorrectLotExpiryInput {
  locationId: string;
  purchaseLineId: string;
  expiresOn: string | null;
}

export type CorrectLotExpiryOutcome = { kind: "not_found" } | { kind: "corrected" };

export async function correctLotExpiry(
  tx: PurchasedLotStoreTransaction,
  input: CorrectLotExpiryInput,
): Promise<CorrectLotExpiryOutcome> {
  const lots = await tx.lotsOfPurchaseLines(input.locationId, [input.purchaseLineId]);
  const lot = lots.find((candidate) => candidate.splitFromLotId === null);
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
  await tx.setLotExpiry(lot.lotId, input.expiresOn);
  return { kind: "corrected" };
}
