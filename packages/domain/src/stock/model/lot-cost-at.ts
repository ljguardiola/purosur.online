import type { LotCost } from "./lot-value.js";

export interface LotCostChange {
  changedAt: Date;
  previous: LotCost;
}

export interface LotWithCostChanges {
  cost: LotCost | null;
  costChanges: readonly LotCostChange[];
}

export function lotCostAt(lot: LotWithCostChanges, at: Date): LotCost | null {
  const [next] = lot.costChanges
    .filter((change) => change.changedAt.getTime() > at.getTime())
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  return next === undefined ? lot.cost : next.previous;
}
