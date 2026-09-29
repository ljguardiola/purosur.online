import { fetchStockBalances } from "./stock-api";

export type StockBalancesScreenServices = {
  fetchStockBalances: typeof fetchStockBalances;
};

export const defaultStockBalancesScreenServices: StockBalancesScreenServices = {
  fetchStockBalances,
};
