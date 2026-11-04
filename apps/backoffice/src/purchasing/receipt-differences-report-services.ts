import { fetchReceiptDifferencesReport } from "./receipt-differences-report-api";

export type ReceiptDifferencesReportScreenServices = {
  fetchReceiptDifferencesReport: typeof fetchReceiptDifferencesReport;
};

export const defaultReceiptDifferencesReportScreenServices: ReceiptDifferencesReportScreenServices =
  { fetchReceiptDifferencesReport };
