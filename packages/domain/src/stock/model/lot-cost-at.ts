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
  const next = lot.costChanges
    .filter((change) => change.changedAt.getTime() > at.getTime())
    .reduce<LotCostChange | undefined>(
      (earliest, change) =>
        earliest === undefined || change.changedAt.getTime() < earliest.changedAt.getTime()
          ? change
          : earliest,
      undefined,
    );
  return next === undefined ? lot.cost : next.previous;
}
