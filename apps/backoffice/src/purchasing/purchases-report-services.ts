import type { fetchPurchasesReport } from "./purchases-report-api";

export type PurchasesReportScreenServices = {
  fetchPurchasesReport: typeof fetchPurchasesReport;
};
