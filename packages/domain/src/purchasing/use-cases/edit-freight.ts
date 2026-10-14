import type { Clock } from "../../shared/index.js";
import type { Freight, FreightStore, FreightValues } from "./freight-store.js";
import {
  type FreightInputRefusal,
  type FreightPurchasesRefusal,
  refuseUnfitFreight,
  refuseUnfitFreightPurchases,
  sortedDistinct,
} from "./refuse-unfit-freight.js";

export interface EditFreightInput extends FreightValues {
  locationId: string;
  actorId: string;
  freightId: string;
}

export interface EditFreightPorts {
  store: FreightStore;
  clock: Clock;
}

export type EditFreightOutcome =
  | FreightInputRefusal
  | FreightPurchasesRefusal
  | { kind: "freight_not_found" }
  | { kind: "edited"; freight: Freight };

export async function editFreight(
  { store, clock }: EditFreightPorts,
  input: EditFreightInput,
): Promise<EditFreightOutcome> {
  const editedAt = clock.now();
  const refusal = refuseUnfitFreight(input, editedAt);
  if (refusal) {
    return refusal;
  }
  const next: FreightValues = {
    date: input.date,
    amountCents: input.amountCents,
    description: input.description,
    means: input.means,
    purchaseIds: sortedDistinct(input.purchaseIds),
  };

  return store.transaction<EditFreightOutcome>(async (tx) => {
    const locked = await tx.lockFreight(input.locationId, input.freightId);
    if (locked.kind === "not_found") {
      return { kind: "freight_not_found" };
    }
    const purchasesRefusal = await refuseUnfitFreightPurchases(
      tx,
      input.locationId,
      next.purchaseIds,
    );
    if (purchasesRefusal) {
      return purchasesRefusal;
    }
    const { id, locationId, recordedAt, actorId, ...previous } = locked.freight;
    await tx.replaceFreight(id, next);
    await tx.recordFreightEdit({
      freightId: id,
      actorId: input.actorId,
      editedAt,
      previous,
      next,
    });
    return { kind: "edited", freight: { id, locationId, recordedAt, actorId, ...next } };
  });
}
