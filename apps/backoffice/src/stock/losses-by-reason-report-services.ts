import { fetchLossesByReasonReport } from "./losses-by-reason-report-api";

export type LossesByReasonReportScreenServices = {
  fetchLossesByReasonReport: typeof fetchLossesByReasonReport;
};

export const defaultLossesByReasonReportScreenServices: LossesByReasonReportScreenServices = {
  fetchLossesByReasonReport,
};
