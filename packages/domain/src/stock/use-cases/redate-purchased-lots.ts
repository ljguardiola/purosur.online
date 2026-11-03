import { numbersKeptByLotsStaying } from "../model/lot-name.js";
import type { PurchasedLotStoreTransaction } from "./purchased-lot-store.js";

export interface RedatePurchasedLotsInput {
  locationId: string;
  purchaseLineIds: readonly string[];
  purchasedOn: string;
}

export type RedatePurchasedLotsOutcome = { kind: "not_found" } | { kind: "redated" };

export async function redatePurchasedLots(
  tx: PurchasedLotStoreTransaction,
  input: RedatePurchasedLotsInput,
): Promise<RedatePurchasedLotsOutcome> {
  const lots = await tx.lotsOfPurchaseLines(input.locationId, input.purchaseLineIds);
  if (input.purchaseLineIds.some((id) => !lots.some((lot) => lot.purchaseLineId === id))) {
    return { kind: "not_found" };
  }
  const productIds = [...new Set(lots.map((lot) => lot.productId))].sort();
  for (const productId of productIds) {
    const locked = await tx.lockProductStock({ productId, locationId: input.locationId });
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
  }
  const lotIds = lots.map((lot) => lot.lotId);
  await tx.giveLotNumbers(
    numbersKeptByLotsStaying(await tx.namingOfPurchasedLots(input.locationId, productIds), lotIds),
  );
  await tx.renameLotsToPurchaseDay(lotIds, input.purchasedOn);
  return { kind: "redated" };
}
