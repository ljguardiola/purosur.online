import {
  type PendingPurchaseOrdersBody,
  type PendingPurchaseOrdersQuery,
  pendingPurchaseOrdersSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchPendingPurchaseOrdersReport(
  query: PendingPurchaseOrdersQuery,
): Promise<CloudReadOutcome<PendingPurchaseOrdersBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/pending-purchase-orders";
  return readCloudJson(search ? `${path}?${search}` : path, pendingPurchaseOrdersSchema);
}
