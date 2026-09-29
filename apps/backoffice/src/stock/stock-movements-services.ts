import { fetchStockBalances, fetchStockMovements, recordAdjustment, recordLoss } from "./stock-api";

export type StockMovementsScreenServices = {
  fetchStockMovements: typeof fetchStockMovements;
  fetchStockBalances: typeof fetchStockBalances;
  recordLoss: typeof recordLoss;
  recordAdjustment: typeof recordAdjustment;
};

export const defaultStockMovementsScreenServices: StockMovementsScreenServices = {
  fetchStockMovements,
  fetchStockBalances,
  recordLoss,
  recordAdjustment,
};
