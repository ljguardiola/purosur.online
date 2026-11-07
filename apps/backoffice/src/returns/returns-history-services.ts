import { fetchReturnsReport } from "./returns-report-api";

export type ReturnsHistoryScreenServices = {
  fetchReturnsReport: typeof fetchReturnsReport;
};

export const defaultReturnsHistoryScreenServices: ReturnsHistoryScreenServices = {
  fetchReturnsReport,
};
