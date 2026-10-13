import { fetchReportRegisters } from "../shell/report-registers-api";
import { fetchSalesReport } from "./sales-report-api";

export type SalesByDayScreenServices = {
  fetchSalesReport: typeof fetchSalesReport;
  fetchReportRegisters: typeof fetchReportRegisters;
};

export const defaultSalesByDayScreenServices: SalesByDayScreenServices = {
  fetchSalesReport,
  fetchReportRegisters,
};
