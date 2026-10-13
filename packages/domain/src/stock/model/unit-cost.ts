import { roundHalfUp } from "../../shared/index.js";
import { knownLotCost, type LotCost } from "./lot-value.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

// The only rounding of a unit cost: the exact pair stays as it was paid and is rounded only to be shown.
export function unitCostCents(costPaidCents: number, quantityPerPackage: number): number {
  return roundHalfUp({
    numerator: BigInt(costPaidCents) * BigInt(STOCK_QUANTITY_PER_UNIT),
    denominator: BigInt(quantityPerPackage),
  });
}

export function lotUnitCostCents({
  cost,
  costIncomplete,
}: {
  cost: LotCost | null;
  costIncomplete: boolean;
}): number | null {
  const known = knownLotCost({ cost, costIncomplete });
  return known === null ? null : unitCostCents(known.totalCents, known.quantity);
}
