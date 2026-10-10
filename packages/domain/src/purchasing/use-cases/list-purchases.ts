import { unitCostCents } from "../model/purchase-line.js";
import type {
  PurchaseLineListing,
  PurchaseListing,
  PurchasingListReader,
} from "./purchasing-list-reader.js";

export interface ListedPurchaseLine extends PurchaseLineListing {
  unitCostCents: number;
}

export interface ListedPurchase extends PurchaseListing {
  lines: ListedPurchaseLine[];
}

function listedPurchase(listing: PurchaseListing): ListedPurchase {
  return {
    ...listing,
    lines: listing.lines.map((line) => ({
      ...line,
      unitCostCents: unitCostCents(line.costPaidCents, line.quantityPerPackage),
    })),
  };
}

export async function listPurchases(
  reader: PurchasingListReader,
  locationId: string,
): Promise<ListedPurchase[]> {
  return (await reader.purchases(locationId)).map(listedPurchase);
}

export async function findPurchaseListing(
  reader: PurchasingListReader,
  purchaseId: string,
): Promise<ListedPurchase | undefined> {
  const listing = await reader.purchase(purchaseId);
  return listing && listedPurchase(listing);
}
