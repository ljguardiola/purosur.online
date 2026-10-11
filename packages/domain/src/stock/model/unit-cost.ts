import { roundHalfUp } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

// The only rounding of a cost: the exact pair stays as it was paid and is rounded only to be shown.
export function unitCostCents(costPaidCents: number, quantityPerPackage: number): number {
  return roundHalfUp({
    numerator: BigInt(costPaidCents) * BigInt(STOCK_QUANTITY_PER_UNIT),
    denominator: BigInt(quantityPerPackage),
  });
}
