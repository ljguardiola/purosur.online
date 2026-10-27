import { fetchCurrentStockReport } from "./current-stock-report-api";

export type CurrentStockReportScreenServices = {
  fetchCurrentStockReport: typeof fetchCurrentStockReport;
};

export const defaultCurrentStockReportScreenServices: CurrentStockReportScreenServices = {
  fetchCurrentStockReport,
};
