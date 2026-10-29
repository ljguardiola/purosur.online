import type { LoadedSupplierPrice } from "../model/lot-reference-cost.js";
import type { LotCost } from "../model/lot-value.js";

export type LotOriginKind = "initial_count" | "purchase" | "technical" | "assembly_batch";

export interface LockedLot {
  productId: string;
  origin: LotOriginKind;
  withdrawn: boolean;
  remaining: number;
}

export interface LotCostStore {
  transaction<TOutcome>(work: (tx: LotCostTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface LotCostTransaction {
  lockLot(locationId: string, lotId: string): Promise<LockedLot | undefined>;
  loadedSupplierPrices(productId: string): Promise<LoadedSupplierPrice[]>;
  setReferenceCost(lotId: string, cost: LotCost): Promise<void>;
}
