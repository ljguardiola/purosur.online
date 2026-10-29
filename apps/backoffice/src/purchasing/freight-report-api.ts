import {
  type FreightByPeriodBody,
  type FreightByPeriodQuery,
  freightByPeriodSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchFreightReport(
  query: FreightByPeriodQuery,
): Promise<CloudReadOutcome<FreightByPeriodBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/freight-by-period";
  return readCloudJson(search ? `${path}?${search}` : path, freightByPeriodSchema);
}
