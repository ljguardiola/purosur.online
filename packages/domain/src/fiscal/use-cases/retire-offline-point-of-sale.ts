import type { Clock } from "../../shared/index.js";
import { offlinePointOfSaleRetirementRefusal } from "../model/point-of-sale.js";
import type { RetireOfflinePointOfSaleStore } from "./retire-offline-point-of-sale-store.js";

export interface RetireOfflinePointOfSalePorts {
  store: RetireOfflinePointOfSaleStore;
  clock: Clock;
}

export interface RetireOfflinePointOfSaleInput {
  locationId: string;
  pointOfSaleNumber: number;
  actorId: string;
}

export type RetireOfflinePointOfSaleOutcome =
  | { kind: "not_found" }
  | { kind: "already_retired" }
  | { kind: "assigned" }
  | { kind: "retired"; retiredAt: Date };

export function retireOfflinePointOfSale(
  { store, clock }: RetireOfflinePointOfSalePorts,
  input: RetireOfflinePointOfSaleInput,
): Promise<RetireOfflinePointOfSaleOutcome> {
  return store.transaction<RetireOfflinePointOfSaleOutcome>(async (tx) => {
    await tx.lockPointOfSale(input.pointOfSaleNumber);
    const holder = await tx.branchPointOfSaleClaim(input.locationId, input.pointOfSaleNumber);
    const assignedTo = await tx.offlineRegisterOf(input.pointOfSaleNumber);
    const refusal = offlinePointOfSaleRetirementRefusal(holder, assignedTo !== null);
    if (refusal !== undefined) {
      return { kind: refusal };
    }

    const retiredAt = clock.now();
    await tx.retirePointOfSale({
      pointOfSaleNumber: input.pointOfSaleNumber,
      retiredAt,
      actorId: input.actorId,
    });
    return { kind: "retired", retiredAt };
  });
}
