import { fetchCurrentZoneRules } from "../platform/zone-rules-api";
import type { NewCountModalServices } from "./new-count-modal";
import {
  fetchExpectedBalance,
  fetchStockBalances,
  fetchStockCounts,
  fetchStockMovements,
  registerCount,
} from "./stock-api";
import {
  defaultStockMovementModalServices,
  type StockMovementModalServices,
} from "./stock-movement-modal-services";
import type { StockMovementsScreenServices } from "./stock-movements-services";

export type StockBalancesReader = {
  fetchStockBalances: typeof fetchStockBalances;
};

export type StockBalancesScreenServices = StockBalancesReader &
  NewCountModalServices &
  StockMovementModalServices &
  Pick<StockMovementsScreenServices, "fetchStockCounts" | "fetchStockMovements">;

export const defaultStockBalancesScreenServices: StockBalancesScreenServices = {
  ...defaultStockMovementModalServices,
  fetchStockBalances,
  fetchStockCounts,
  fetchStockMovements,
  fetchExpectedBalance,
  registerCount,
  fetchCurrentZoneRules,
};
