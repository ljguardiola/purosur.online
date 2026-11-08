import {
  fetchStockBalances,
  fetchStockMovementReasons,
  fetchStockProducts,
  recordAdjustment,
  recordLoss,
} from "./stock-api";

export type StockMovementModalServices = {
  fetchStockMovementReasons: typeof fetchStockMovementReasons;
  fetchStockProducts: typeof fetchStockProducts;
  fetchStockBalances: typeof fetchStockBalances;
  recordLoss: typeof recordLoss;
  recordAdjustment: typeof recordAdjustment;
};

export const defaultStockMovementModalServices: StockMovementModalServices = {
  fetchStockMovementReasons,
  fetchStockProducts,
  fetchStockBalances,
  recordLoss,
  recordAdjustment,
};
