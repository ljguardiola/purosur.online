import {
  type CashSessionClosesBody,
  cashSessionClosesSchema,
  type ReportQuery,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchCashSessionCloses(
  query: ReportQuery,
): Promise<CloudReadOutcome<CashSessionClosesBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/cash-session-closes";
  return readCloudJson(search ? `${path}?${search}` : path, cashSessionClosesSchema);
}
