import {
  type BuyerTaxStatusOption,
  isSameBuyerTaxStatusSet,
  isValidBuyerTaxStatusSet,
} from "../model/buyer-tax-status-set.js";
import type { BuyerTaxStatusPorts } from "./buyer-tax-status-store.js";

export interface RecordBuyerTaxStatusSetInput {
  options: BuyerTaxStatusOption[];
}

export type RecordBuyerTaxStatusSetOutcome =
  | { kind: "invalid_set" }
  | { kind: "unchanged"; paramsVersion: number }
  | { kind: "recorded"; paramsVersion: number };

export async function recordBuyerTaxStatusSet(
  { store }: BuyerTaxStatusPorts,
  input: RecordBuyerTaxStatusSetInput,
): Promise<RecordBuyerTaxStatusSetOutcome> {
  if (!isValidBuyerTaxStatusSet(input.options)) {
    return { kind: "invalid_set" };
  }

  return store.transaction<RecordBuyerTaxStatusSetOutcome>(async (tx) => {
    // Locks the current set so two concurrent recordings can't both take the same next version.
    const current = await tx.lockCurrentBuyerTaxStatusSet();
    if (current && isSameBuyerTaxStatusSet(current.options, input.options)) {
      return { kind: "unchanged", paramsVersion: current.paramsVersion };
    }

    const paramsVersion = (current?.paramsVersion ?? 0) + 1;
    await tx.recordBuyerTaxStatusSet({ paramsVersion, options: input.options });
    return { kind: "recorded", paramsVersion };
  });
}
