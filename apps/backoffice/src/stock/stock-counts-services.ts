import {
  fetchExpectedBalance,
  fetchStockBalances,
  fetchStockCounts,
  fetchStockProducts,
  registerCount,
} from "./stock-api";

export type StockCountsScreenServices = {
  fetchStockCounts: typeof fetchStockCounts;
  fetchStockProducts: typeof fetchStockProducts;
  fetchStockBalances: typeof fetchStockBalances;
  fetchExpectedBalance: typeof fetchExpectedBalance;
  registerCount: typeof registerCount;
};

export const defaultStockCountsScreenServices: StockCountsScreenServices = {
  fetchStockCounts,
  fetchStockProducts,
  fetchStockBalances,
  fetchExpectedBalance,
  registerCount,
};
