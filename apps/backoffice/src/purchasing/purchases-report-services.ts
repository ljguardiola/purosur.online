import { fetchPurchasesReport } from "./purchases-report-api";

export type PurchasesReportScreenServices = {
  fetchPurchasesReport: typeof fetchPurchasesReport;
};

export const defaultPurchasesReportScreenServices: PurchasesReportScreenServices = {
  fetchPurchasesReport,
};
