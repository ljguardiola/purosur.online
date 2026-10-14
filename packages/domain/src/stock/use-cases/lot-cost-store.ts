import type { LotCost } from "../model/lot-value.js";

export type LotOriginKind = "initial_count" | "purchase" | "technical" | "assembly_batch";

export interface LockedLot {
  origin: LotOriginKind;
  withdrawn: boolean;
  remaining: number;
}

export interface LotCostStore {
  transaction<TOutcome>(work: (tx: LotCostTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface LotCostTransaction {
  lockLot(locationId: string, lotId: string): Promise<LockedLot | undefined>;
  setReferenceCost(lotId: string, cost: LotCost): Promise<void>;
}
