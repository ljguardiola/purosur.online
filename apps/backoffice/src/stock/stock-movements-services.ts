import {
  defaultLossesByReasonReportContentServices,
  type LossesByReasonReportContentServices,
} from "./losses-by-reason-report-content-services";
import { fetchStockCounts, fetchStockMovements } from "./stock-api";

export type StockMovementsScreenServices = LossesByReasonReportContentServices & {
  fetchStockMovements: typeof fetchStockMovements;
  fetchStockCounts: typeof fetchStockCounts;
};

export const defaultStockMovementsScreenServices: StockMovementsScreenServices = {
  fetchStockMovements,
  fetchStockCounts,
  ...defaultLossesByReasonReportContentServices,
};
