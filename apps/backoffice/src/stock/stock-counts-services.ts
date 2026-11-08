import type { fetchCurrentZoneRules } from "../platform/zone-rules-api";
import type {
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
  fetchCurrentZoneRules: typeof fetchCurrentZoneRules;
};
