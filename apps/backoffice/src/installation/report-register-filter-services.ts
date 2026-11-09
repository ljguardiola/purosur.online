import { fetchReportRegisters } from "./report-registers-api";

export type ReportRegisterFilterServices = {
  fetchReportRegisters: typeof fetchReportRegisters;
};

export const defaultReportRegisterFilterServices: ReportRegisterFilterServices = {
  fetchReportRegisters,
};
