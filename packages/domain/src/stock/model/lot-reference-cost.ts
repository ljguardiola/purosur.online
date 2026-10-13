import { isValidCashAmount } from "../../shared/index.js";
import type { LotCost } from "./lot-value.js";
import { STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

export function referenceCostOf(unitCostCents: number): LotCost {
  return { totalCents: unitCostCents, quantity: STOCK_QUANTITY_PER_UNIT };
}

export function isReferenceUnitCost(cents: number): boolean {
  return cents > 0 && isValidCashAmount(cents);
}
