import { initialCountLotTakesCost } from "../model/initial-count.js";
import {
  isReferenceUnitCost,
  referenceCostOf,
  referenceCostOfPrice,
  selectableSupplierPrices,
} from "../model/lot-reference-cost.js";
import type { LotCostStore } from "./lot-cost-store.js";

export type LotCostChoice =
  | { kind: "typed"; unitCostCents: number }
  | { kind: "supplier_price"; supplierItemId: string };

export interface SetLotReferenceCostInput {
  locationId: string;
  lotId: string;
  choice: LotCostChoice;
}

export type SetLotReferenceCostOutcome =
  | { kind: "invalid_cost" }
  | { kind: "not_found" }
  | { kind: "not_an_initial_count_lot" }
  | { kind: "lot_withdrawn" }
  | { kind: "cost_chosen_from_supplier_prices" }
  | { kind: "supplier_price_not_found" }
  | { kind: "set" };

export async function setLotReferenceCost(
  { store }: { store: LotCostStore },
  { locationId, lotId, choice }: SetLotReferenceCostInput,
): Promise<SetLotReferenceCostOutcome> {
  if (choice.kind === "typed" && !isReferenceUnitCost(choice.unitCostCents)) {
    return { kind: "invalid_cost" };
  }
  return store.transaction<SetLotReferenceCostOutcome>(async (tx) => {
    const lot = await tx.lockLot(locationId, lotId);
    if (lot === undefined) {
      return { kind: "not_found" };
    }
    if (lot.origin !== "initial_count") {
      return { kind: "not_an_initial_count_lot" };
    }
    if (!initialCountLotTakesCost(lot)) {
      return { kind: "lot_withdrawn" };
    }
    const prices = selectableSupplierPrices(await tx.loadedSupplierPrices(lot.productId));
    if (choice.kind === "typed") {
      if (prices.length > 0) {
        return { kind: "cost_chosen_from_supplier_prices" };
      }
      await tx.setReferenceCost(lotId, referenceCostOf(choice.unitCostCents));
      return { kind: "set" };
    }
    const price = prices.find(({ supplierItemId }) => supplierItemId === choice.supplierItemId);
    const cost = price && referenceCostOfPrice(price.pricePerSaleUnit);
    if (cost === undefined || cost === null) {
      return { kind: "supplier_price_not_found" };
    }
    await tx.setReferenceCost(lotId, cost);
    return { kind: "set" };
  });
}
