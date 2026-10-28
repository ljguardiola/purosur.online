import {
  type LossesByReasonReportBody,
  type LossesByReasonReportQuery,
  lossesByReasonReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchLossesByReasonReport(
  query: LossesByReasonReportQuery,
): Promise<CloudReadOutcome<LossesByReasonReportBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/losses-by-reason";
  return readCloudJson(search ? `${path}?${search}` : path, lossesByReasonReportSchema);
}
