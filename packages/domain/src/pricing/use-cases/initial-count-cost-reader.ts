import type { LotCost } from "../../stock/index.js";

export interface InitialCountCost {
  productId: string;
  countedAt: Date;
  withdrawn: boolean;
  costIncomplete: boolean;
  cost: LotCost | null;
}

export interface InitialCountCostReader {
  initialCountCostsOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<InitialCountCost[]>;
}
