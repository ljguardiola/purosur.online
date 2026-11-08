import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canPerformStockCounts,
  canSeeExpiringLots,
  canSeeStockBalances,
  canSeeStockMovements,
} from "../shell/backoffice-access";

export type StockTab = "balances" | "expiries" | "movements";

export const STOCK_TABS: readonly PagePart<BackofficeAccess, StockTab>[] = [
  { key: "balances", isVisibleTo: canSeeStockBalances },
  { key: "expiries", isVisibleTo: canSeeExpiringLots },
  {
    key: "movements",
    isVisibleTo: (access) => canPerformStockCounts(access) || canSeeStockMovements(access),
  },
];

export const STOCK_TAB_TARGETS = {
  balances: "/stock",
  expiries: "/stock/expiries",
  movements: "/stock/movements",
} as const;
