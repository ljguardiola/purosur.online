import { createRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeStockPage } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { refuseWithout } from "./signed-in-route";
import { stockAreaRoute } from "./stock-area";
import { STOCK_TAB_TARGETS, STOCK_TABS, type StockTab } from "./stock-tabs";

export const stockRegisterSearch = z.object({
  register: z.enum(["initial-inventory"]).optional().catch(undefined),
});

export const stockRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "stock",
  validateSearch: stockRegisterSearch,
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeStockPage);
    return {
      stockTabs: STOCK_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./stock-page"), "StockPage"),
});

export function stockTabRedirect(stockTabs: readonly StockTab[], own: StockTab): void {
  const [first] = stockTabs;
  if (stockTabs.includes(own) || (first === undefined && own === "balances")) {
    return;
  }
  throw redirect({ to: first === undefined ? "/stock" : STOCK_TAB_TARGETS[first] });
}
