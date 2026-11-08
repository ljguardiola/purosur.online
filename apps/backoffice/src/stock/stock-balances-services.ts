import { fetchCurrentZoneRules } from "../platform/zone-rules-api";
import {
  fetchExpectedBalance,
  fetchStockBalances,
  fetchStockCounts,
  registerCount,
} from "./stock-api";
import type { StockCountsScreenServices } from "./stock-counts-services";
import {
  defaultStockMovementsScreenServices,
  type StockMovementsScreenServices,
} from "./stock-movements-services";

export type StockBalancesReader = {
  fetchStockBalances: typeof fetchStockBalances;
};

export type StockBalancesScreenServices = StockBalancesReader &
  StockCountsScreenServices &
  StockMovementsScreenServices;

export const defaultStockBalancesScreenServices: StockBalancesScreenServices = {
  ...defaultStockMovementsScreenServices,
  fetchStockBalances,
  fetchStockCounts,
  fetchExpectedBalance,
  registerCount,
  fetchCurrentZoneRules,
};
