import type { PurchaseCorrectionChange } from "./purchase-correction-store.js";

export interface PurchaseChangeListing {
  id: string;
  actorId: string;
  actorName: string;
  correctedAt: Date;
  change: PurchaseCorrectionChange;
}

export interface PurchaseChangeReader {
  // Undefined when the purchase does not exist in the branch.
  purchaseChanges(
    locationId: string,
    purchaseId: string,
  ): Promise<PurchaseChangeListing[] | undefined>;
}
