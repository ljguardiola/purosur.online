import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import type { PurchaseCorrectionChange } from "./purchase-correction-store.js";

export interface PurchaseChangeListing {
  id: string;
  actorId: string;
  actorName: string;
  correctedAt: Date;
  change: PurchaseCorrectionChange;
}

export interface PurchaseChangeProduct extends ProductBrandAndNetContent {
  id: string;
  name: string;
  saleUnit: SaleUnit;
}

export interface PurchaseChangeReader {
  // Undefined when the purchase does not exist in the branch.
  purchaseChanges(
    locationId: string,
    purchaseId: string,
  ): Promise<PurchaseChangeListing[] | undefined>;
  // The product each line of the purchase has now, by line id, removed lines included.
  productOfEachLine(purchaseId: string): Promise<Map<string, string>>;
  describedProducts(productIds: readonly string[]): Promise<Map<string, PurchaseChangeProduct>>;
}
