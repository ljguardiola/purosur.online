import {
  type AiCostByPeriodBody,
  type AiCostByPeriodQuery,
  aiCostByPeriodSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchAiCostReport(
  query: AiCostByPeriodQuery,
): Promise<CloudReadOutcome<AiCostByPeriodBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "group_by"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return readCloudJson(`/api/reports/ai-cost-by-period?${params.toString()}`, aiCostByPeriodSchema);
}
