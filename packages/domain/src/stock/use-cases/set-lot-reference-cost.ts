import { initialCountLotTakesCost } from "../model/initial-count.js";
import { isReferenceUnitCost, referenceCostOf } from "../model/lot-reference-cost.js";
import type { LotCostStore } from "./lot-cost-store.js";

export interface SetLotReferenceCostInput {
  locationId: string;
  lotId: string;
  unitCostCents: number;
}

export type SetLotReferenceCostOutcome =
  | { kind: "invalid_cost" }
  | { kind: "not_found" }
  | { kind: "not_an_initial_count_lot" }
  | { kind: "lot_withdrawn" }
  | { kind: "set" };

export async function setLotReferenceCost(
  { store }: { store: LotCostStore },
  input: SetLotReferenceCostInput,
): Promise<SetLotReferenceCostOutcome> {
  if (!isReferenceUnitCost(input.unitCostCents)) {
    return { kind: "invalid_cost" };
  }
  return store.transaction<SetLotReferenceCostOutcome>(async (tx) => {
    const lot = await tx.lockLot(input.locationId, input.lotId);
    if (lot === undefined) {
      return { kind: "not_found" };
    }
    if (lot.origin !== "initial_count") {
      return { kind: "not_an_initial_count_lot" };
    }
    if (!initialCountLotTakesCost(lot)) {
      return { kind: "lot_withdrawn" };
    }
    await tx.setReferenceCost(input.lotId, referenceCostOf(input.unitCostCents));
    return { kind: "set" };
  });
}
