import {
  type MarginReportBody,
  type MarginReportQuery,
  marginReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchMarginReport(
  query: MarginReportQuery,
): Promise<CloudReadOutcome<MarginReportBody>> {
  const params = new URLSearchParams({ group: query.group });
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return readCloudJson(`/api/reports/margin?${params.toString()}`, marginReportSchema);
}
