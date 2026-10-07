import { nextBuyerTaxStatusFetchAt } from "../model/buyer-tax-status-fetch.js";
import { isWsaaTokenValid } from "../model/wsaa-token.js";
import type { FetchBuyerTaxStatusSetPorts } from "./buyer-tax-status-source.js";
import {
  type RecordBuyerTaxStatusSetOutcome,
  recordBuyerTaxStatusSet,
} from "./record-buyer-tax-status-set.js";

export interface FetchBuyerTaxStatusSetInput {
  service: string;
  certificateFingerprint: string;
}

export type FetchBuyerTaxStatusSetOutcome = (
  | { kind: "no_valid_token" }
  | { kind: "fetch_failed" }
  | RecordBuyerTaxStatusSetOutcome
) & { nextFetchAt: Date };

export async function fetchBuyerTaxStatusSet(
  { tokens, source, store, clock }: FetchBuyerTaxStatusSetPorts,
  { service, certificateFingerprint }: FetchBuyerTaxStatusSetInput,
): Promise<FetchBuyerTaxStatusSetOutcome> {
  const token = await tokens.currentWsaaToken(service, certificateFingerprint);
  if (token === null || !isWsaaTokenValid(token, clock.now())) {
    return {
      kind: "no_valid_token",
      nextFetchAt: nextBuyerTaxStatusFetchAt({ gotSet: false }, clock.now()),
    };
  }

  const fetched = await source.fetchBuyerTaxStatusSet(token);
  if (fetched.kind === "failed") {
    return {
      kind: "fetch_failed",
      nextFetchAt: nextBuyerTaxStatusFetchAt({ gotSet: false }, clock.now()),
    };
  }

  const recorded = await recordBuyerTaxStatusSet({ store }, { options: fetched.options });
  return { ...recorded, nextFetchAt: nextBuyerTaxStatusFetchAt({ gotSet: true }, clock.now()) };
}
