import { fetchExpiringLotsReport } from "./expiring-lots-report-api";

export type ExpiringLotsReportScreenServices = {
  fetchExpiringLotsReport: typeof fetchExpiringLotsReport;
};

export const defaultExpiringLotsReportScreenServices: ExpiringLotsReportScreenServices = {
  fetchExpiringLotsReport,
};
