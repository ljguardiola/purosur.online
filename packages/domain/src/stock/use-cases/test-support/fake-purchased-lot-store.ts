import type { PurchasedLot, PurchasedLotStoreTransaction } from "../purchased-lot-store.js";
import type { LockProductStockResult, ProductStockKey } from "../stock-store.js";

export interface FakePurchasedLot extends PurchasedLot {
  locationId: string;
  expiresOn: string | null;
  purchasedOn: string;
  nameOrder: number;
  remaining: number;
}

export class FakePurchasedLotTransaction implements PurchasedLotStoreTransaction {
  lots: FakePurchasedLot[];
  missingProducts = new Set<string>();
  operations: string[] = [];

  constructor(lots: FakePurchasedLot[]) {
    this.lots = lots;
  }

  async lockProductStock(key: ProductStockKey): Promise<LockProductStockResult> {
    this.operations.push(`lockProductStock:${key.productId}`);
    return this.missingProducts.has(key.productId)
      ? { kind: "not_found" }
      : { kind: "locked", saleUnit: "UNIT", balance: 0 };
  }

  async lotsOfPurchaseLines(
    locationId: string,
    purchaseLineIds: readonly string[],
  ): Promise<PurchasedLot[]> {
    this.operations.push("lotsOfPurchaseLines");
    return this.lots
      .filter(
        (lot) => lot.locationId === locationId && purchaseLineIds.includes(lot.purchaseLineId),
      )
      .map(({ lotId, purchaseLineId, productId }) => ({ lotId, purchaseLineId, productId }));
  }

  async setLotExpiry(lotId: string, expiresOn: string | null): Promise<void> {
    this.operations.push("setLotExpiry");
    for (const lot of this.lots) {
      if (lot.lotId === lotId) {
        lot.expiresOn = expiresOn;
      }
    }
  }

  async renameLotsToPurchaseDay(lotIds: readonly string[], purchasedOn: string): Promise<void> {
    this.operations.push("renameLotsToPurchaseDay");
    let lastNameOrder = Math.max(0, ...this.lots.map((lot) => lot.nameOrder));
    for (const lot of this.lots) {
      if (lotIds.includes(lot.lotId)) {
        lot.purchasedOn = purchasedOn;
        lastNameOrder += 1;
        lot.nameOrder = lastNameOrder;
      }
    }
  }
}
