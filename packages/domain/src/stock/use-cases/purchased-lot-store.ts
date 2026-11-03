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
  setLotsPurchasedOn(lotIds: readonly string[], purchasedOn: string): Promise<void>;
}
