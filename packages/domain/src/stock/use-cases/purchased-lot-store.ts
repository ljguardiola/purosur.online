import type { PurchasedLotNaming } from "../model/lot-name.js";
import type { StockStoreTransaction } from "./stock-store.js";

export interface PurchasedLot {
  lotId: string;
  purchaseLineId: string;
  productId: string;
}

export interface PurchasedLotStoreTransaction
  extends Pick<StockStoreTransaction, "lockProductStock"> {
  // The lots the purchase lines created, one per line, in no particular order.
  lotsOfPurchaseLines(
    locationId: string,
    purchaseLineIds: readonly string[],
  ): Promise<PurchasedLot[]>;
  setLotExpiry(lotId: string, expiresOn: string | null): Promise<void>;
  // Every purchased lot of each product in the branch, with what its name is made of.
  namingOfPurchasedLots(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchasedLotNaming[]>;
  giveLotNumbers(numbers: ReadonlyMap<string, number>): Promise<void>;
  // The lots take the purchase day as their name day and take their name again, after every lot
  // that already has one, leaving behind the number they were given.
  renameLotsToPurchaseDay(lotIds: readonly string[], purchasedOn: string): Promise<void>;
}
