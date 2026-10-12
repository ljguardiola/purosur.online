import type { LotCost } from "../../model/lot-value.js";
import type {
  LockedLot,
  LotCostStore,
  LotCostTransaction,
  LotOriginKind,
} from "../lot-cost-store.js";

export interface FakeCostLot {
  id: string;
  locationId: string;
  origin: LotOriginKind;
  withdrawn: boolean;
  cost: LotCost | null;
  costIncomplete: boolean;
}

export class FakeLotCostStore implements LotCostStore {
  lots: FakeCostLot[];
  lockedLots: string[] = [];
  failingWrite = false;

  constructor(lots: FakeCostLot[]) {
    this.lots = lots;
  }

  async transaction<TOutcome>(
    work: (tx: LotCostTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = this.lots.map((lot) => ({ ...lot }));
    try {
      return await work({
        lockLot: async (locationId, lotId): Promise<LockedLot | undefined> => {
          this.lockedLots.push(lotId);
          const lot = this.lots.find((row) => row.id === lotId && row.locationId === locationId);
          return lot && { origin: lot.origin, withdrawn: lot.withdrawn };
        },
        setReferenceCost: async (lotId, cost) => {
          if (this.failingWrite) {
            throw new Error("setReferenceCost failed");
          }
          const lot = this.lots.find((row) => row.id === lotId);
          if (lot) {
            lot.cost = { ...cost };
            lot.costIncomplete = false;
          }
        },
      });
    } catch (error) {
      this.lots = before;
      throw error;
    }
  }
}
