import type { LotCost } from "../../stock/index.js";

export interface PurchaseLineCost {
  productId: string;
  lineId: string;
  purchasedOn: string;
  recordedAt: Date;
  cost: LotCost;
}

export interface PurchaseCostReader {
  purchaseLineCostsOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchaseLineCost[]>;
}
