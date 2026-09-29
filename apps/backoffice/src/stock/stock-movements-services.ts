import {
  fetchStockBalances,
  fetchStockMovements,
  fetchStockProducts,
  recordAdjustment,
  recordLoss,
} from "./stock-api";

export type StockMovementsScreenServices = {
  fetchStockMovements: typeof fetchStockMovements;
  fetchStockProducts: typeof fetchStockProducts;
  fetchStockBalances: typeof fetchStockBalances;
  recordLoss: typeof recordLoss;
  recordAdjustment: typeof recordAdjustment;
};

export const defaultStockMovementsScreenServices: StockMovementsScreenServices = {
  fetchStockMovements,
  fetchStockProducts,
  fetchStockBalances,
  recordLoss,
  recordAdjustment,
};
