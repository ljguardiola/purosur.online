import { fetchFreightReport } from "./freight-report-api";

export type FreightReportScreenServices = {
  fetchFreightReport: typeof fetchFreightReport;
};

export const defaultFreightReportScreenServices: FreightReportScreenServices = {
  fetchFreightReport,
};
