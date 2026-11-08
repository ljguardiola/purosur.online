import {
  defaultLossesByReasonReportScreenServices,
  type LossesByReasonReportScreenServices,
} from "./losses-by-reason-report-services";
import { fetchStockCounts, fetchStockMovements } from "./stock-api";

export type StockMovementsScreenServices = LossesByReasonReportScreenServices & {
  fetchStockMovements: typeof fetchStockMovements;
  fetchStockCounts: typeof fetchStockCounts;
};

export const defaultStockMovementsScreenServices: StockMovementsScreenServices = {
  fetchStockMovements,
  fetchStockCounts,
  ...defaultLossesByReasonReportScreenServices,
};
