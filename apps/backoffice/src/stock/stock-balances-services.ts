import { fetchProductLots, fetchStockBalances } from "./stock-api";
import type { StockLotsModalServices } from "./stock-lots-modal";

export type StockBalancesScreenServices = StockLotsModalServices & {
  fetchStockBalances: typeof fetchStockBalances;
};

export const defaultStockBalancesScreenServices: StockBalancesScreenServices = {
  fetchStockBalances,
  fetchProductLots,
};
