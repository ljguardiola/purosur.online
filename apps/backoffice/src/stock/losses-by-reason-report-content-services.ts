import { fetchLossesByReasonReport } from "./losses-by-reason-report-api";

export type LossesByReasonReportContentServices = {
  fetchLossesByReasonReport: typeof fetchLossesByReasonReport;
};

export const defaultLossesByReasonReportContentServices: LossesByReasonReportContentServices = {
  fetchLossesByReasonReport,
};
