import { fetchRemovedLinesAndCancelledSales } from "./sales-report-api";

export type RemovedLinesAndCancelledSalesScreenServices = {
  fetchRemovedLinesAndCancelledSales: typeof fetchRemovedLinesAndCancelledSales;
};

export const defaultRemovedLinesAndCancelledSalesScreenServices: RemovedLinesAndCancelledSalesScreenServices =
  {
    fetchRemovedLinesAndCancelledSales,
  };
