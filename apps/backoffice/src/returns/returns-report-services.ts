import { fetchReturnsReport } from "./returns-report-api";

export type ReturnsReportScreenServices = {
  fetchReturnsReport: typeof fetchReturnsReport;
};

export const defaultReturnsReportScreenServices: ReturnsReportScreenServices = {
  fetchReturnsReport,
};
