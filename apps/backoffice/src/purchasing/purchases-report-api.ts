import {
  type PurchasesBySupplierBody,
  type PurchasesBySupplierQuery,
  purchasesBySupplierSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchPurchasesReport(
  query: PurchasesBySupplierQuery,
): Promise<CloudReadOutcome<PurchasesBySupplierBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/purchases-by-supplier";
  return readCloudJson(search ? `${path}?${search}` : path, purchasesBySupplierSchema);
}
