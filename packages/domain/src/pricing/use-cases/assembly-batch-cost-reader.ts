import type { LotCost } from "../../stock/index.js";

export interface AssemblyBatchCost {
  productId: string;
  batchId: string;
  assembledAt: Date;
  cost: LotCost;
  costIncomplete: boolean;
}

export interface AssemblyBatchCostReader {
  batchLotCostsOf(locationId: string, productIds: readonly string[]): Promise<AssemblyBatchCost[]>;
}
