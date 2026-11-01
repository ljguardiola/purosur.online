import { type OrderSuggestion, orderSuggestionSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export type FetchOrderSuggestionOutcome = CloudReadOutcome<OrderSuggestion>;

export function fetchOrderSuggestion(): Promise<FetchOrderSuggestionOutcome> {
  return readCloudJson("/api/order-suggestion", orderSuggestionSchema);
}
