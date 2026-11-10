import type { fetchPurchasesReport } from "./purchases-report-api";

export type PurchasesReportContentServices = {
  fetchPurchasesReport: typeof fetchPurchasesReport;
};
