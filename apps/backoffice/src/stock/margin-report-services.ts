import { fetchMarginReport } from "./margin-report-api";

export type MarginReportScreenServices = {
  fetchMarginReport: typeof fetchMarginReport;
};

export const defaultMarginReportScreenServices: MarginReportScreenServices = {
  fetchMarginReport,
};
