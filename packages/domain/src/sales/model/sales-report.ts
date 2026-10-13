import type { SaleState } from "./sale.js";

export interface SalesOfDay {
  day: string;
  salesCount: number;
  total: number;
}

export interface SalesReportTotals {
  salesCount: number;
  total: number;
}

export function salesReportTotals(days: readonly SalesOfDay[]): SalesReportTotals {
  return {
    salesCount: days.reduce((sum, day) => sum + day.salesCount, 0),
    total: days.reduce((sum, day) => sum + day.total, 0),
  };
}

export const SALES_REPORT_SALE_STATE = "COMPLETED" satisfies SaleState;
