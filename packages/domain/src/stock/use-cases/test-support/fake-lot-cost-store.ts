import type { LoadedSupplierPrice } from "../../model/lot-reference-cost.js";
import type { LotCost } from "../../model/lot-value.js";
import type {
  LockedLot,
  LotCostStore,
  LotCostTransaction,
  LotOriginKind,
} from "../lot-cost-store.js";

export interface FakeCostLot {
  id: string;
  productId: string;
  locationId: string;
  origin: LotOriginKind;
  withdrawn: boolean;
  remaining: number;
  cost: LotCost | null;
  costIncomplete: boolean;
}

export class FakeLotCostStore implements LotCostStore {
  lots: FakeCostLot[];
  lockedLots: string[] = [];
  operations: string[] = [];
  private readonly supplierPrices = new Map<string, LoadedSupplierPrice[]>();
  failingWrite = false;

  constructor(lots: FakeCostLot[]) {
    this.lots = lots;
  }

  seedSupplierPrices(productId: string, prices: LoadedSupplierPrice[]): void {
    this.supplierPrices.set(productId, prices);
  }

  async transaction<TOutcome>(
    work: (tx: LotCostTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = this.lots.map((lot) => ({ ...lot }));
    try {
      return await work({
        lockLot: async (locationId, lotId): Promise<LockedLot | undefined> => {
          this.lockedLots.push(lotId);
          this.operations.push("lockLot");
          const lot = this.lots.find((row) => row.id === lotId && row.locationId === locationId);
          return (
            lot && {
              productId: lot.productId,
              origin: lot.origin,
              withdrawn: lot.withdrawn,
              remaining: lot.remaining,
            }
          );
        },
        loadedSupplierPrices: async (productId) => {
          this.operations.push(`loadedSupplierPrices:${productId}`);
          return (this.supplierPrices.get(productId) ?? []).map((price) => ({ ...price }));
        },
        setReferenceCost: async (lotId, cost) => {
          this.operations.push("setReferenceCost");
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
