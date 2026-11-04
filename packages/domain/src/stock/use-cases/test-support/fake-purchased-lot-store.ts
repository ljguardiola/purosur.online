import type { LotNameFacts, PurchasedLotNaming } from "../../model/lot-name.js";
import type { PurchasedLot, PurchasedLotStoreTransaction } from "../purchased-lot-store.js";
import type { LockProductStockResult, ProductStockKey } from "../stock-store.js";

export interface FakePurchasedLot extends PurchasedLot {
  locationId: string;
  expiresOn: string | null;
  purchasedOn: string;
  nameOrder: number;
  givenNumber: number | null;
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

  async namingOfPurchasedLots(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchasedLotNaming[]> {
    this.operations.push("namingOfPurchasedLots");
    return this.lots
      .filter((lot) => lot.locationId === locationId && productIds.includes(lot.productId))
      .map(({ lotId, productId, purchasedOn, nameOrder, givenNumber }) => ({
        lotId,
        productId,
        purchasedOn,
        nameOrder,
        givenNumber,
      }));
  }

  async giveLotNumbers(numbers: ReadonlyMap<string, number>): Promise<void> {
    this.operations.push("giveLotNumbers");
    for (const lot of this.lots) {
      lot.givenNumber = numbers.get(lot.lotId) ?? lot.givenNumber;
    }
  }

  nameFacts(): LotNameFacts[] {
    return this.lots.map(
      ({ lotId, productId, locationId, nameOrder, givenNumber, purchasedOn }) => ({
        lotId,
        productId,
        locationId,
        nameOrder,
        givenNumber,
        origin: { kind: "purchase", purchasedOn },
      }),
    );
  }

  async renameLotsToPurchaseDay(lotIds: readonly string[], purchasedOn: string): Promise<void> {
    this.operations.push("renameLotsToPurchaseDay");
    let lastNameOrder = Math.max(0, ...this.lots.map((lot) => lot.nameOrder));
    for (const lot of this.lots) {
      if (lotIds.includes(lot.lotId)) {
        lot.purchasedOn = purchasedOn;
        lot.givenNumber = null;
        lastNameOrder += 1;
        lot.nameOrder = lastNameOrder;
      }
    }
  }
}
