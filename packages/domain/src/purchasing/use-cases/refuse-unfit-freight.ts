import {
  hasFreightPurchases,
  isFreightAmount,
  isFreightDescription,
  isValidFreightMeans,
} from "../model/freight.js";
import { hasDistributableValue } from "../model/freight-distribution.js";
import { isPurchaseDateInFuture } from "../model/purchase.js";
import type { FreightStoreTransaction, FreightValues } from "./freight-store.js";

export type FreightInputRefusal =
  | { kind: "no_purchases" }
  | { kind: "invalid_amount" }
  | { kind: "date_in_future" }
  | { kind: "invalid_description" }
  | { kind: "invalid_means" };

export type FreightPurchasesRefusal =
  | { kind: "purchase_not_found" }
  | { kind: "purchases_without_value" };

export function sortedDistinct(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function refuseUnfitFreight(
  values: FreightValues,
  now: Date,
): FreightInputRefusal | undefined {
  if (!hasFreightPurchases(values.purchaseIds.length)) {
    return { kind: "no_purchases" };
  }
  if (!isFreightAmount(values.amountCents)) {
    return { kind: "invalid_amount" };
  }
  if (isPurchaseDateInFuture(values.date, now)) {
    return { kind: "date_in_future" };
  }
  if (!isFreightDescription(values.description)) {
    return { kind: "invalid_description" };
  }
  if (!isValidFreightMeans(values.means)) {
    return { kind: "invalid_means" };
  }
  return undefined;
}

export async function refuseUnfitFreightPurchases(
  tx: FreightStoreTransaction,
  locationId: string,
  purchaseIds: readonly string[],
): Promise<FreightPurchasesRefusal | undefined> {
  const found = await tx.lockPurchasesForFreight(locationId, purchaseIds);
  if (found.length !== purchaseIds.length) {
    return { kind: "purchase_not_found" };
  }
  if (!hasDistributableValue(found.flatMap(({ lines }) => lines))) {
    return { kind: "purchases_without_value" };
  }
  return undefined;
}
