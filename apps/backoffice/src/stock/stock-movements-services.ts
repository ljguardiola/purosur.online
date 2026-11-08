import {
  defaultLossesByReasonReportScreenServices,
  type LossesByReasonReportScreenServices,
} from "./losses-by-reason-report-services";
import {
  fetchStockBalances,
  fetchStockCounts,
  fetchStockMovementReasons,
  fetchStockMovements,
  fetchStockProducts,
  recordAdjustment,
  recordLoss,
} from "./stock-api";

export type StockMovementsScreenServices = {
  fetchStockMovements: typeof fetchStockMovements;
  fetchStockMovementReasons: typeof fetchStockMovementReasons;
  fetchStockProducts: typeof fetchStockProducts;
  fetchStockBalances: typeof fetchStockBalances;
  recordLoss: typeof recordLoss;
  recordAdjustment: typeof recordAdjustment;
};

export const defaultStockMovementsScreenServices: StockMovementsScreenServices = {
  fetchStockMovements,
  fetchStockMovementReasons,
  fetchStockProducts,
  fetchStockBalances,
  recordLoss,
  recordAdjustment,
};

export type StockRecordsServices = Pick<StockMovementsScreenServices, "fetchStockMovements"> &
  LossesByReasonReportScreenServices & { fetchStockCounts: typeof fetchStockCounts };

export const defaultStockRecordsServices: StockRecordsServices = {
  fetchStockMovements,
  fetchStockCounts,
  ...defaultLossesByReasonReportScreenServices,
};
