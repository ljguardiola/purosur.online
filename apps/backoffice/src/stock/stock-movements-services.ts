import {
  fetchStockBalances,
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
