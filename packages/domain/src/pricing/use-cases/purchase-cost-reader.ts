import type { FreightToDistribute } from "../../purchasing/index.js";
import type { LotCost } from "../../stock/index.js";

export interface PurchaseLineCost {
  productId: string;
  lineId: string;
  purchasedOn: string;
  recordedAt: Date;
  cost: LotCost;
  // Every freight linked to the line's purchase, with all the lines of the purchases it covers.
  freights: FreightToDistribute[];
}

export interface PurchaseCostReader {
  purchaseLineCostsOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchaseLineCost[]>;
}
