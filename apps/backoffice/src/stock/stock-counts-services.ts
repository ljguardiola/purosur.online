import {
  fetchExpectedBalance,
  fetchStockCounts,
  fetchStockProducts,
  registerCount,
} from "./stock-api";

export type StockCountsScreenServices = {
  fetchStockCounts: typeof fetchStockCounts;
  fetchStockProducts: typeof fetchStockProducts;
  fetchExpectedBalance: typeof fetchExpectedBalance;
  registerCount: typeof registerCount;
};

export const defaultStockCountsScreenServices: StockCountsScreenServices = {
  fetchStockCounts,
  fetchStockProducts,
  fetchExpectedBalance,
  registerCount,
};
