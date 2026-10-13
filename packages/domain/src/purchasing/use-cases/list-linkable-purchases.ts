import { purchaseValueCents } from "../model/freight-distribution.js";
import type { ReceiptType } from "../model/purchase.js";
import type {
  FreightListReader,
  FreightPurchaseListing,
  LinkablePurchaseListing,
} from "./freight-list-reader.js";

export interface LinkablePurchasesQuery {
  locationId: string;
  since: string;
  freightId?: string;
}

export interface LinkablePurchase extends FreightPurchaseListing {
  receiptType: ReceiptType;
  receiptNumber: string | null;
  valueCents: number;
}

export async function listLinkablePurchases(
  reader: FreightListReader,
  { locationId, since, freightId }: LinkablePurchasesQuery,
): Promise<LinkablePurchase[]> {
  const recent = await reader.purchasesSince(locationId, since);
  const linked =
    freightId === undefined ? [] : await reader.purchasesLinkedTo(locationId, freightId);
  const byId = new Map([...recent, ...linked].map((purchase) => [purchase.id, purchase]));
  // Each sort keeps the order the previous one left among equals, so the last is the main key.
  return [...byId.keys()]
    .sort()
    .map((id) => byId.get(id) as LinkablePurchaseListing)
    .sort((left, right) => right.recordedAt.getTime() - left.recordedAt.getTime())
    .sort((left, right) => right.purchasedOn.localeCompare(left.purchasedOn))
    .map((purchase) => ({
      id: purchase.id,
      purchasedOn: purchase.purchasedOn,
      supplier: purchase.supplier,
      receiptType: purchase.receiptType,
      receiptNumber: purchase.receiptNumber,
      valueCents: purchaseValueCents(purchase.lines),
    }));
}
