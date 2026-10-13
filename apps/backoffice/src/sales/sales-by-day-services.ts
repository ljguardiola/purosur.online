import { fetchSalesReport } from "./sales-report-api";

export type SalesByDayScreenServices = {
  fetchSalesReport: typeof fetchSalesReport;
};

export const defaultSalesByDayScreenServices: SalesByDayScreenServices = {
  fetchSalesReport,
};
