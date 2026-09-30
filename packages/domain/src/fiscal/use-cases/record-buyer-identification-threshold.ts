import {
  type BuyerIdentificationThreshold,
  startsAfterLatestThreshold,
} from "../model/buyer-identification-threshold.js";
import type { BuyerIdentificationThresholdPorts } from "./buyer-identification-threshold-store.js";

export interface RecordBuyerIdentificationThresholdInput {
  amount: number;
  validFrom: string;
  actorId: string;
}

export type RecordBuyerIdentificationThresholdOutcome =
  | { kind: "recorded"; threshold: BuyerIdentificationThreshold }
  | { kind: "not_after_latest"; latestValidFrom: string };

export async function recordBuyerIdentificationThreshold(
  { store }: BuyerIdentificationThresholdPorts,
  input: RecordBuyerIdentificationThresholdInput,
): Promise<RecordBuyerIdentificationThresholdOutcome> {
  return store.transaction<RecordBuyerIdentificationThresholdOutcome>(async (tx) => {
    // Locks the latest threshold so two concurrent recordings can't both start after the same one.
    const latest = await tx.lockLatestBuyerIdentificationThreshold();
    if (latest && !startsAfterLatestThreshold(input.validFrom, latest)) {
      return { kind: "not_after_latest", latestValidFrom: latest.validFrom };
    }

    const threshold = await tx.recordBuyerIdentificationThreshold(input);
    return { kind: "recorded", threshold };
  });
}
