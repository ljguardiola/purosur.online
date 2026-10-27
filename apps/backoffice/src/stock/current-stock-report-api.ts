import {
  type CurrentStockReportBody,
  type CurrentStockReportQuery,
  currentStockReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchCurrentStockReport(
  query: CurrentStockReportQuery,
): Promise<CloudReadOutcome<CurrentStockReportBody>> {
  const params = new URLSearchParams();
  if (query.category_id !== undefined) {
    params.set("category_id", query.category_id);
  }
  const search = params.toString();
  const path = "/api/reports/current-stock";
  return readCloudJson(search ? `${path}?${search}` : path, currentStockReportSchema);
}
