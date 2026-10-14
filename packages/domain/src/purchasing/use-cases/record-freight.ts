import type { Clock } from "../../shared/index.js";
import type { Freight, FreightStore, FreightValues } from "./freight-store.js";
import {
  type FreightInputRefusal,
  type FreightPurchasesRefusal,
  refuseUnfitFreight,
  refuseUnfitFreightPurchases,
  sortedDistinct,
} from "./refuse-unfit-freight.js";

export interface RecordFreightInput extends FreightValues {
  locationId: string;
  actorId: string;
}

export interface RecordFreightPorts {
  store: FreightStore;
  clock: Clock;
}

export type RecordFreightOutcome =
  | FreightInputRefusal
  | FreightPurchasesRefusal
  | { kind: "recorded"; freight: Freight };

export async function recordFreight(
  { store, clock }: RecordFreightPorts,
  input: RecordFreightInput,
): Promise<RecordFreightOutcome> {
  const recordedAt = clock.now();
  const refusal = refuseUnfitFreight(input, recordedAt);
  if (refusal) {
    return refusal;
  }
  const purchaseIds = sortedDistinct(input.purchaseIds);

  return store.transaction<RecordFreightOutcome>(async (tx) => {
    const purchasesRefusal = await refuseUnfitFreightPurchases(tx, input.locationId, purchaseIds);
    if (purchasesRefusal) {
      return purchasesRefusal;
    }
    const fields = {
      locationId: input.locationId,
      actorId: input.actorId,
      recordedAt,
      date: input.date,
      amountCents: input.amountCents,
      description: input.description,
      means: input.means,
      purchaseIds,
    };
    const { id } = await tx.insertFreight(fields);
    return { kind: "recorded", freight: { id, ...fields } };
  });
}
