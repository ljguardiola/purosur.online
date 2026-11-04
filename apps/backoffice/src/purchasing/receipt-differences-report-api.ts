import {
  type ReceiptDifferencesBody,
  type ReceiptDifferencesQuery,
  receiptDifferencesSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchReceiptDifferencesReport(
  query: ReceiptDifferencesQuery,
): Promise<CloudReadOutcome<ReceiptDifferencesBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/receipt-differences";
  return readCloudJson(search ? `${path}?${search}` : path, receiptDifferencesSchema);
}
