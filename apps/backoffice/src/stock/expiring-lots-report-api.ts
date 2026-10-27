import {
  type ExpiringLotsReportBody,
  type ExpiringLotsReportQuery,
  expiringLotsReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchExpiringLotsReport(
  query: ExpiringLotsReportQuery,
): Promise<CloudReadOutcome<ExpiringLotsReportBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/expiring-lots";
  return readCloudJson(search ? `${path}?${search}` : path, expiringLotsReportSchema);
}
