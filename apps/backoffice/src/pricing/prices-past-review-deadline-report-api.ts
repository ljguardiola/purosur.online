import {
  type PricesPastReviewDeadlineReportBody,
  type PricesPastReviewDeadlineReportQuery,
  pricesPastReviewDeadlineReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchPricesPastReviewDeadlineReport(
  query: PricesPastReviewDeadlineReportQuery,
): Promise<CloudReadOutcome<PricesPastReviewDeadlineReportBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/prices-past-review-deadline";
  return readCloudJson(search ? `${path}?${search}` : path, pricesPastReviewDeadlineReportSchema);
}
