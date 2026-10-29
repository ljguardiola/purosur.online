import { fetchPricesPastReviewDeadlineReport } from "./prices-past-review-deadline-report-api";

export type PricesPastReviewDeadlineReportScreenServices = {
  fetchPricesPastReviewDeadlineReport: typeof fetchPricesPastReviewDeadlineReport;
};

export const defaultPricesPastReviewDeadlineReportScreenServices: PricesPastReviewDeadlineReportScreenServices =
  { fetchPricesPastReviewDeadlineReport };
