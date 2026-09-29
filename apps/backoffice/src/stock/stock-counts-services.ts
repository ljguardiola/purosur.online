import {
  fetchExpectedBalance,
  fetchStockBalances,
  fetchStockCounts,
  registerCount,
} from "./stock-api";

export type StockCountsScreenServices = {
  fetchStockCounts: typeof fetchStockCounts;
  fetchStockBalances: typeof fetchStockBalances;
  fetchExpectedBalance: typeof fetchExpectedBalance;
  registerCount: typeof registerCount;
};

export const defaultStockCountsScreenServices: StockCountsScreenServices = {
  fetchStockCounts,
  fetchStockBalances,
  fetchExpectedBalance,
  registerCount,
};
