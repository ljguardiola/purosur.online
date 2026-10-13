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

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function newestFirst(left: LinkablePurchaseListing, right: LinkablePurchaseListing): number {
  return (
    compareText(right.purchasedOn, left.purchasedOn) ||
    right.recordedAt.getTime() - left.recordedAt.getTime() ||
    compareText(left.id, right.id)
  );
}

export async function listLinkablePurchases(
  reader: FreightListReader,
  { locationId, since, freightId }: LinkablePurchasesQuery,
): Promise<LinkablePurchase[]> {
  const recent = await reader.purchasesSince(locationId, since);
  const linked =
    freightId === undefined ? [] : await reader.purchasesLinkedTo(locationId, freightId);
  const byId = new Map([...recent, ...linked].map((purchase) => [purchase.id, purchase]));
  return [...byId.values()].sort(newestFirst).map((purchase) => ({
    id: purchase.id,
    purchasedOn: purchase.purchasedOn,
    supplier: purchase.supplier,
    receiptType: purchase.receiptType,
    receiptNumber: purchase.receiptNumber,
    valueCents: purchaseValueCents(purchase.lines),
  }));
}
