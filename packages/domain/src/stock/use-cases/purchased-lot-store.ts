import type { PurchasedLotNaming } from "../model/lot-name.js";
import type { LotCost } from "../model/lot-value.js";
import type { StockStoreTransaction } from "./stock-store.js";

export interface PurchasedLot {
  lotId: string;
  purchaseLineId: string;
  productId: string;
  // The lot a split took its units from; the lot the purchase line created has none.
  splitFromLotId: string | null;
}

export interface SplittableLot {
  remaining: number;
  purchasedOn: string;
  createdAt: Date;
  costIncomplete: boolean;
}

export interface NewSplitLot {
  productId: string;
  locationId: string;
  purchaseLineId: string;
  splitFromLotId: string;
  quantityReceived: number;
  cost: LotCost | null;
  costIncomplete: boolean;
  expiresOn: string | null;
  purchasedOn: string;
  createdAt: Date;
}

export interface LotCostChangeRecord {
  lotId: string;
  changedAt: Date;
  previous: LotCost;
}

export interface PurchasedLotStoreTransaction
  extends Pick<StockStoreTransaction, "lockProductStock" | "recordMovement" | "allocateToLot"> {
  // The lots the purchase lines created and the lots split from them, in no particular order.
  lotsOfPurchaseLines(
    locationId: string,
    purchaseLineIds: readonly string[],
  ): Promise<PurchasedLot[]>;
  splittableLot(lotId: string): Promise<SplittableLot | null>;
  recordSplitLot(lot: NewSplitLot): Promise<string>;
  setLotExpiry(lotId: string, expiresOn: string | null): Promise<void>;
  costOfLot(lotId: string): Promise<LotCost | null>;
  // Keeps the cost the lot had before the change, so what was valued with it stays valued with it.
  recordLotCostChange(change: LotCostChangeRecord): Promise<void>;
  setLotCost(lotId: string, cost: LotCost): Promise<void>;
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
